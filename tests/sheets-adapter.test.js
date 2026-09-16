import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeSpreadsheet,
  transaction,
  backup,
} from "../src/database/apps-script.js";
import { SCHEMA } from "../src/database/schema.js";
function fakeGoogle() {
  const sheets = new Map(),
    props = new Map();
  let locked = false,
    fail = false,
    batches = [];
  let sharing = "PRIVATE";
  function sheet(name) {
    const s = {
      name,
      rows: [],
      id: sheets.size + 1,
      getName: () => name,
      getLastRow: () => s.rows.length,
      getLastColumn: () => s.rows.reduce((n, r) => Math.max(n, r.length), 0),
      getSheetId: () => s.id,
      getMaxRows: () => 1000,
      setFrozenRows: () => {},
      getRange: (row, col, n, m) => ({
        getValues: () =>
          Array.from({ length: n }, (_, i) =>
            Array.from(
              { length: m },
              (_, j) => s.rows[row - 1 + i]?.[col - 1 + j] ?? "",
            ),
          ),
        setValues: (v) => {
          v.forEach((r, i) => (s.rows[row - 1 + i] = structuredClone(r)));
          return { setFontWeight: () => ({ setBackground: () => {} }) };
        },
      }),
    };
    sheets.set(name, s);
    return s;
  }
  const book = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: sheet,
  };
  globalThis.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null }),
  };
  globalThis.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        if (locked) return false;
        locked = true;
        return true;
      },
      releaseLock: () => (locked = false),
    }),
  };
  globalThis.SpreadsheetApp = { openById: () => book, flush: () => {} };
  const copy = {
    setSharing: (a) => {
      assert.equal(a, "PRIVATE");
    },
    getId: () => "backup-id",
    getUrl: () => "https://drive.google.com/backup-id",
    getSharingAccess: () => "PRIVATE",
  };
  globalThis.DriveApp = {
    Access: { PRIVATE: "PRIVATE" },
    Permission: { NONE: "NONE" },
    getFileById: (id) =>
      id === "backup-id"
        ? copy
        : { getSharingAccess: () => sharing, makeCopy: () => copy },
  };
  globalThis.Sheets = {
    Spreadsheets: {
      Values: {
        batchGet: () => ({
          valueRanges: Object.keys(SCHEMA).map((n) => ({
            values: structuredClone(sheets.get(n).rows),
          })),
        }),
      },
      batchUpdate: ({ requests }) => {
        batches.push(requests);
        if (fail) throw new Error("Injected atomic write failure");
        for (const r of requests) {
          if (!r.updateCells) continue;
          const { start, rows } = r.updateCells,
            s = [...sheets.values()].find((s) => s.id === start.sheetId);
          s.rows[start.rowIndex] = rows[0].values.map(
            (v) => v.userEnteredValue?.stringValue ?? "",
          );
        }
      },
    },
  };
  return {
    sheets,
    props,
    batches,
    setFailure: (v) => (fail = v),
    setSharing: (v) => (sharing = v),
    setLocked: (v) => (locked = v),
  };
}
test("actual Sheets initializer is repeatable and preserves existing evaluation cells", () => {
  const g = fakeGoogle();
  initializeSpreadsheet();
  const before = JSON.stringify([...g.sheets.values()].map((s) => s.rows));
  initializeSpreadsheet();
  assert.equal(
    JSON.stringify([...g.sheets.values()].map((s) => s.rows)),
    before,
  );
  transaction((db) => db.Evaluations.push({ id: "history", total: 19 }));
  const records = JSON.stringify(g.sheets.get("Evaluations").rows);
  initializeSpreadsheet();
  assert.equal(JSON.stringify(g.sheets.get("Evaluations").rows), records);
});
test("schema preflight prevents modifications on unexpected headers and future versions", () => {
  const g = fakeGoogle();
  initializeSpreadsheet();
  g.sheets.get("Projects").rows[0][0] = "wrong";
  const before = JSON.stringify([...g.sheets.values()].map((s) => s.rows));
  assert.throws(() => initializeSpreadsheet(), { code: "SCHEMA" });
  assert.equal(
    JSON.stringify([...g.sheets.values()].map((s) => s.rows)),
    before,
  );
  g.sheets.get("Projects").rows[0][0] = "id";
  g.sheets.get("Meta").rows[1][1] = "99";
  assert.throws(() => initializeSpreadsheet(), { code: "SCHEMA" });
});
test("evaluation and audit persist in one explicit-string batch; failed batch changes neither", () => {
  const g = fakeGoogle();
  initializeSpreadsheet();
  const before = JSON.stringify([...g.sheets.values()].map((s) => s.rows));
  g.setFailure(true);
  assert.throws(() =>
    transaction((db) => {
      db.Evaluations.push({ id: "e", notes: "=IMPORTXML(A1)" });
      db.AuditLogs.push({ id: "audit" });
    }),
  );
  assert.equal(
    JSON.stringify([...g.sheets.values()].map((s) => s.rows)),
    before,
  );
  g.setFailure(false);
  transaction((db) => {
    db.Evaluations.push({ id: "e", notes: "=IMPORTXML(A1)" });
    db.AuditLogs.push({ id: "audit" });
  });
  const batch = g.batches.at(-1);
  assert.equal(batch.length, 2);
  assert.ok(
    batch.every((r) =>
      r.updateCells.rows[0].values.every(
        (v) => v.userEnteredValue.stringValue !== undefined,
      ),
    ),
  );
  assert.equal(
    JSON.parse(g.sheets.get("Evaluations").rows[1][7]),
    "=IMPORTXML(A1)",
  );
});
test("private-sharing guard and lock failure stop database access; backup is restricted", () => {
  const g = fakeGoogle();
  initializeSpreadsheet();
  g.setSharing("ANYONE");
  assert.throws(() => transaction(() => {}), { code: "CONFIG" });
  g.setSharing("PRIVATE");
  assert.equal(backup().id, "backup-id");
  g.setLocked(true);
  assert.throws(() => transaction(() => {}), { code: "RETRY" });
});
