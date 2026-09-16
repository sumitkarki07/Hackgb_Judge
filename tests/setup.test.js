import test from "node:test";
import assert from "node:assert/strict";
import { initializeData, emptyDatabase } from "../src/database/schema.js";
import { fixture } from "./helpers.js";
import { safeCsv } from "../src/security/validation.js";
test("initialization is idempotent and preserves all existing records and settings", () => {
  const db = initializeData(emptyDatabase(), 1);
  db.Evaluations.push({ id: "historical", total: 20 });
  db.Settings[0].name = "Existing event";
  const before = JSON.stringify(db);
  initializeData(db, 2);
  assert.equal(JSON.stringify(db), before);
});
test("unknown schema version is rejected without data changes", () => {
  const db = initializeData(emptyDatabase(), 1);
  db.Meta[0].version = 999;
  const before = JSON.stringify(db);
  assert.throws(() => initializeData(db, 2), { code: "SCHEMA" });
  assert.equal(JSON.stringify(db), before);
});
test("CSV import previews quotes and multiline content, preserves IDs and prevents duplicate imports", () => {
  const f = fixture(0, 0);
  const p = {
    kind: "Projects",
    csv: 'Project Title,URL,Description\r\n"A, B",https://devpost.com/software/example,"Line one\nLine two"',
    mapping: {
      name: "Project Title",
      devpost: "URL",
      description: "Description",
    },
  };
  const preview = f.call("admin.importPreview", p);
  assert.equal(preview.rows[0].record.name, "A, B");
  assert.equal(f.env.db.Projects.length, 0);
  f.call("admin.import", p);
  assert.equal(f.env.db.Projects.length, 1);
  f.call("admin.import", p);
  assert.equal(f.env.db.Projects.length, 1);
  const old = f.env.db.Projects[0];
  f.call("admin.saveProject", { ...old, name: "Renamed", table: "77" });
  assert.equal(f.env.db.Projects[0].id, old.id);
});
test("invalid imports are atomic and formula-like strings remain literal", () => {
  const f = fixture(0, 0);
  assert.throws(
    () =>
      f.call("admin.import", {
        kind: "Projects",
        csv: "Name,Link\nGood,https://example.test\nBad,javascript:alert(1)",
        mapping: { name: "Name", devpost: "Link" },
      }),
    { code: "VALIDATION" },
  );
  assert.equal(f.env.db.Projects.length, 0);
  f.call("admin.import", {
    kind: "Projects",
    csv: "Name\n=IMPORTXML(A1)",
    mapping: { name: "Name" },
  });
  assert.equal(f.env.db.Projects[0].name, "=IMPORTXML(A1)");
  assert.ok(
    f.call("admin.export", { table: "Projects" }).csv.includes("'=IMPORTXML"),
  );
});
test("judge CSV deduplication and credential-free exports", () => {
  const f = fixture(0, 0),
    p = {
      kind: "Judges",
      csv: "Full name,Email\nSam,sam@example.test\nSam Again,sam@example.test",
      mapping: { name: "Full name", email: "Email" },
    };
  const r = f.call("admin.import", p);
  assert.equal(r.rows[1].status, "duplicate");
  assert.equal(f.env.db.Judges.length, 1);
  assert.equal(f.env.db.Judges[0].verifier, "");
});
test("CSV export neutralizes spreadsheet formulas and control prefixes", () => {
  const result = safeCsv([
    { a: " =1+1", b: "@SUM(A1)", c: "-1+2", d: "\t=1", e: '"text"' },
  ]);
  assert.ok(result.includes("' =1+1"));
  assert.ok(result.includes("'@SUM"));
  assert.ok(result.includes('""text""'));
});
test("backup is organizer-only and audited", () => {
  const f = fixture();
  const r = f.call("admin.backup");
  assert.equal(r.id, "isolated-mock-backup");
  assert.ok(f.env.db.AuditLogs.some((a) => a.action === "backup.create"));
  assert.throws(() => f.call("admin.backup", {}, f.judgeTokens[0].token), {
    code: "FORBIDDEN",
  });
});

test("CSV category names resolve to stable IDs and duplicate category names are rejected", () => {
  const f = fixture(0, 0);
  const category = {
    name: "Best Hardware",
    target: 1,
    rubric: f.env.db.Settings[0].rubric,
    active: true,
  };
  const c = f.call("admin.saveCategory", category);
  assert.throws(() => f.call("admin.saveCategory", category), {
    code: "DUPLICATE",
  });
  f.call("admin.import", {
    kind: "Projects",
    csv: "Name,Prize\nSensor,Best Hardware",
    mapping: { name: "Name", categories: "Prize" },
  });
  assert.deepEqual(f.env.db.Projects[0].categories, [c.id]);
});
