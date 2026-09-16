import { SCHEMA, emptyDatabase, initializeData } from "./schema.js";
import { SPREADSHEET_ID, SCHEMA_VERSION } from "../config/defaults.js";
import { requireThat } from "../security/validation.js";
export function configuration() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty("SPREADSHEET_ID") || SPREADSHEET_ID;
  requireThat(
    id === SPREADSHEET_ID || p.getProperty("ISOLATED_TEST_FIXTURE") === "true",
    "CONFIG",
    "Use the existing HackGB spreadsheet. Alternate IDs require ISOLATED_TEST_FIXTURE=true.",
  );
  return { p, id };
}
function privateWorkbook(id) {
  const f = DriveApp.getFileById(id);
  requireThat(
    f.getSharingAccess() === DriveApp.Access.PRIVATE,
    "CONFIG",
    "The workbook must have restricted sharing. Remove public and domain link access.",
  );
  return f;
}
export function locked(fn) {
  const lock = LockService.getScriptLock();
  requireThat(
    lock.tryLock(10000),
    "RETRY",
    "The server is busy. Please retry; your form is still here.",
  );
  try {
    return fn();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}
function headersValid(sheet, headers) {
  if (!sheet || sheet.getLastRow() === 0) return;
  const actual = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getValues()[0];
  requireThat(
    actual.length === headers.length &&
      actual.every((v, i) => v === headers[i]),
    "SCHEMA",
    `Unexpected ${sheet.getName()} columns. No records were overwritten. Back up and review the schema.`,
  );
}
export function initializeSpreadsheet() {
  return locked(() => {
    const { id } = configuration();
    privateWorkbook(id);
    const book = SpreadsheetApp.openById(id);
    // Preflight all existing sheets and versions before the first mutation.
    for (const [name, headers] of Object.entries(SCHEMA))
      headersValid(book.getSheetByName(name), headers);
    const meta = book.getSheetByName("Meta");
    if (meta && meta.getLastRow() > 1) {
      const rows = meta.getRange(2, 1, meta.getLastRow() - 1, 3).getValues();
      const schema = rows.find((r) => r[0] === '"schema"');
      requireThat(
        schema && JSON.parse(schema[1]) === SCHEMA_VERSION,
        "SCHEMA",
        "Unsupported schema version; backup and reviewed migration required.",
      );
    }
    for (const [name, headers] of Object.entries(SCHEMA)) {
      const sheet = book.getSheetByName(name) || book.insertSheet(name);
      if (sheet.getLastRow() === 0) {
        sheet
          .getRange(1, 1, 1, headers.length)
          .setValues([headers])
          .setFontWeight("bold")
          .setBackground("#dcefe9");
        sheet.setFrozenRows(1);
      }
    }
    SpreadsheetApp.flush();
    const store = readDatabase(id, book);
    const before = JSON.stringify(store.db);
    initializeData(store.db, Date.now());
    if (before !== JSON.stringify(store.db)) writeDatabase(id, store);
    return {
      initialized: true,
      schemaVersion: SCHEMA_VERSION,
      spreadsheetId: id,
    };
  });
}
function readDatabase(id, book) {
  const names = Object.keys(SCHEMA);
  const sheets = Object.fromEntries(
    names.map((n) => {
      const s = book.getSheetByName(n);
      requireThat(
        s,
        "SCHEMA",
        "Run initializeSpreadsheet_ in the Apps Script editor.",
      );
      return [n, s];
    }),
  );
  const result = Sheets.Spreadsheets.Values.batchGet(id, {
    ranges: names.map((n) => `'${n}'!A:Z`),
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const db = emptyDatabase();
  const original = {};
  names.forEach((name, i) => {
    const rows = result.valueRanges[i].values || [];
    requireThat(
      rows[0]?.length === SCHEMA[name].length &&
        rows[0].every((h, k) => h === SCHEMA[name][k]),
      "SCHEMA",
      `Unexpected ${name} schema.`,
    );
    db[name] = rows
      .slice(1)
      .filter((r) => r.some((v) => v !== "" && v != null))
      .map((row) =>
        Object.fromEntries(
          SCHEMA[name].map((h, k) => {
            try {
              return [
                h,
                row[k] == null || row[k] === "" ? null : JSON.parse(row[k]),
              ];
            } catch {
              throw new Error(
                "Malformed stored record. Restore from a verified backup.",
              );
            }
          }),
        ),
      );
    requireThat(
      new Set(db[name].map((r) => r.id)).size === db[name].length,
      "SCHEMA",
      `Duplicate stable IDs in ${name}. Reconcile the workbook before use.`,
    );
    original[name] = JSON.parse(JSON.stringify(db[name]));
  });
  return { db, original, sheets };
}
function writeDatabase(id, { db, original, sheets }) {
  const requests = [];
  for (const [name, headers] of Object.entries(SCHEMA)) {
    const before = original[name],
      after = db[name];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const sheet = sheets[name];
    const length = Math.max(before.length, after.length);
    if (length + 1 > sheet.getMaxRows())
      requests.push({
        appendDimension: {
          sheetId: sheet.getSheetId(),
          dimension: "ROWS",
          length: length + 1 - sheet.getMaxRows(),
        },
      });
    // Explicit stringValue prevents Sheets from evaluating imported/user text as formulas.
    for (let i = 0; i < length; i++)
      if (JSON.stringify(before[i]) !== JSON.stringify(after[i]))
        requests.push({
          updateCells: {
            start: {
              sheetId: sheet.getSheetId(),
              rowIndex: i + 1,
              columnIndex: 0,
            },
            rows: [
              {
                values: headers.map((h) =>
                  after[i]
                    ? {
                        userEnteredValue: {
                          stringValue: JSON.stringify(after[i][h] ?? null),
                        },
                      }
                    : {},
                ),
              },
            ],
            fields: "userEnteredValue",
          },
        });
  }
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests }, id);
}
export function transaction(fn) {
  return locked(() => {
    const { id } = configuration();
    privateWorkbook(id);
    const store = readDatabase(id, SpreadsheetApp.openById(id));
    const result = fn(store.db);
    store.db.Sessions = store.db.Sessions.filter(
      (s) => s.expiresAt > Date.now(),
    );
    store.db.AuthFlows = store.db.AuthFlows.filter(
      (f) => f.expiresAt > Date.now(),
    );
    writeDatabase(id, store);
    return result;
  });
}
export function backup() {
  const { id } = configuration();
  const source = privateWorkbook(id);
  const copy = source.makeCopy(`HackGB backup ${new Date().toISOString()}`);
  copy.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  privateWorkbook(copy.getId());
  return { id: copy.getId(), url: copy.getUrl() };
}
