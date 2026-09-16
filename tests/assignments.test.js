import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
test("50 projects and 10 judges receive three independent judges with balanced loads", () => {
  const f = fixture(50, 10),
    p = f.call("admin.assignmentPreview");
  assert.equal(p.complete, true);
  assert.equal(p.additions.length, 150);
  assert.deepEqual(
    p.loads.map((j) => j.count),
    Array(10).fill(15),
  );
  f.call("admin.applyAssignments", { revision: p.revision });
  assert.equal(
    new Set(f.env.db.Assignments.map((a) => a.judgeId + ":" + a.projectId))
      .size,
    150,
  );
  assert.equal(f.call("admin.assignmentPreview").additions.length, 0);
});
test("insufficient capacity is reported, never partially saved", () => {
  const f = fixture(5, 2),
    p = f.call("admin.assignmentPreview");
  assert.equal(p.complete, false);
  assert.equal(p.shortages.length, 5);
  assert.throws(
    () => f.call("admin.applyAssignments", { revision: p.revision }),
    { code: "CAPACITY" },
  );
  assert.equal(f.env.db.Assignments.length, 0);
});
test("unavailable judges and declared conflicts are excluded", () => {
  const f = fixture(3, 5);
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[0],
    available: false,
  });
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[1],
    conflicts: ["H001"],
  });
  const p = f.call("admin.assignmentPreview");
  assert.equal(p.complete, true);
  assert.ok(!p.additions.some((a) => a.judgeId === "J001"));
  assert.ok(
    !p.additions.some((a) => a.judgeId === "J002" && a.projectId === "H001"),
  );
});
test("a constrained assignment graph is solved without greedy dead ends", () => {
  const f = fixture(2, 2, 1);
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[0],
    capacity: 1,
  });
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[1],
    capacity: 1,
    conflicts: ["H002"],
  });
  const p = f.call("admin.assignmentPreview");
  assert.ok(p.complete);
  assert.ok(
    p.additions.some((a) => a.judgeId === "J001" && a.projectId === "H002"),
  );
});
test("stale previews are rejected", () => {
  const f = fixture();
  const p = f.call("admin.assignmentPreview");
  f.call("admin.saveProject", { ...f.env.db.Projects[0], table: "99" });
  assert.throws(
    () => f.call("admin.applyAssignments", { revision: p.revision }),
    { code: "STALE" },
  );
});
test("manual assignments validate conflicts, availability, duplicate pairs, category and capacity", () => {
  const f = fixture(2, 2, 1);
  const p = { judgeId: "J001", projectId: "H001", categoryId: "overall" };
  f.call("admin.assign", p);
  assert.throws(() => f.call("admin.assign", p), { code: "DUPLICATE" });
  assert.throws(() => f.call("admin.assign", { ...p, categoryId: "bogus" }), {
    code: "VALIDATION",
  });
});
test("pending reassignment preserves history; scored assignments cannot be removed", () => {
  const f = fixture(2, 4, 1);
  f.assign();
  const a = f.env.db.Assignments[0];
  const replacement = f.call("admin.reassign", {
    id: a.id,
    judgeId: "J004",
    reason: "Absent",
  });
  assert.equal(
    f.env.db.Assignments.find((x) => x.id === a.id).status,
    "reassigned",
  );
  assert.equal(replacement.status, "active");
  f.open();
  f.submit(replacement, f.judgeTokens[3].token);
  assert.throws(
    () =>
      f.call("admin.reassign", {
        id: replacement.id,
        judgeId: "J003",
        reason: "Replace",
      }),
    { code: "VALIDATION" },
  );
  assert.equal(f.env.db.Evaluations.length, 1);
});
