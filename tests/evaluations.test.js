import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
function openFixture() {
  const f = fixture(4, 4, 1);
  f.assign();
  f.open();
  f.a = f.env.db.Assignments.find((a) => a.judgeId === "J001");
  f.token = f.judgeTokens[0].token;
  return f;
}
test("assigned project access returns only needed project information", () => {
  const f = openFixture(),
    r = f.call("judge.project", { projectId: f.a.projectId }, f.token);
  assert.equal(r[0].project.members, undefined);
  assert.equal(r[0].project.team, undefined);
  assert.equal(f.call("judge.dashboard", {}, f.token).assignments.length, 1);
});
test("manual URL changes and direct unassigned submissions are rejected", () => {
  const f = openFixture(),
    other = f.env.db.Assignments.find((a) => a.judgeId !== "J001");
  assert.throws(
    () => f.call("judge.project", { projectId: other.projectId }, f.token),
    { code: "FORBIDDEN" },
  );
  assert.throws(() => f.submit(other, f.token), { code: "FORBIDDEN" });
  assert.throws(
    () => f.call("judge.dashboard", { judgeId: "J002" }, f.adminToken),
    { code: "FORBIDDEN" },
  );
});
test("valid scores persist totals, judge identity, notes and timestamp", () => {
  const f = openFixture(),
    r = f.submit(f.a, f.token);
  assert.equal(r.evaluation.total, 14);
  assert.equal(r.evaluation.judgeId, "J001");
  assert.equal(f.env.db.Evaluations.length, 1);
  assert.equal(f.call("admin.dashboard").progress.completed, 1);
  assert.equal(
    f.env.db.Results.find((r) => r.projectId === f.a.projectId).average,
    14,
  );
});
test("missing, out-of-range, fractional and extra criteria cannot be submitted", () => {
  const f = openFixture();
  for (const scores of [
    { technology: 3 },
    { technology: 6, design: 4, completion: 3, learning: 2 },
    { technology: 3.5, design: 4, completion: 3, learning: 2 },
    { technology: null, design: 4, completion: 3, learning: 2 },
    { technology: 3, design: 4, completion: 3, learning: 2, extra: 2 },
  ])
    assert.throws(() => f.submit(f.a, f.token, { scores }), {
      code: "VALIDATION",
    });
  assert.equal(f.env.db.Evaluations.length, 0);
});
test("retries and double submissions never duplicate an evaluation", async () => {
  const f = openFixture(),
    requestId = "retry-same";
  const outcomes = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      Promise.resolve().then(() => f.submit(f.a, f.token, { requestId })),
    ),
  );
  assert.ok(outcomes.every((x) => x.status === "fulfilled"));
  assert.equal(f.env.db.Evaluations.length, 1);
  assert.throws(() => f.submit(f.a, f.token), { code: "DUPLICATE" });
});
test("lock contention is explicitly retryable with no write", () => {
  const f = openFixture();
  f.env.setLocked(true);
  assert.throws(() => f.submit(f.a, f.token), { code: "RETRY" });
  f.env.setLocked(false);
  assert.equal(f.env.db.Evaluations.length, 0);
});
test("closing judging prevents writes; correction history survives reopening", () => {
  const f = openFixture();
  const first = f.submit(f.a, f.token).evaluation;
  f.call("admin.changeState", {
    state: "Judging Closed",
    confirm: "Judging Closed",
    reason: "Time",
  });
  assert.throws(() => f.submit(f.a, f.token), { code: "CLOSED" });
  f.call("admin.reopenEvaluation", {
    assignmentId: f.a.id,
    reason: "Correct score",
  });
  assert.equal(f.env.db.Evaluations[0].total, 14);
  f.call("admin.changeState", {
    state: "Judging Open",
    confirm: "Judging Open",
    reason: "Corrections",
  });
  const second = f.submit(f.a, f.token, {
    expectedVersion: 1,
    scores: { technology: 5, design: 5, completion: 5, learning: 5 },
  }).evaluation;
  assert.equal(second.version, 2);
  assert.equal(f.env.db.Evaluations.length, 2);
  assert.equal(f.call("admin.dashboard").progress.completed, 1);
  assert.equal(
    f.env.db.Results.find((r) => r.projectId === f.a.projectId).average,
    20,
  );
  assert.ok(f.env.db.AuditLogs.some((a) => a.action === "evaluation.reopen"));
  assert.throws(() => f.submit(f.a, f.token, { requestId: first.requestId }), {
    code: "DUPLICATE",
  });
});
test("withdrawn projects cannot be evaluated", () => {
  const f = openFixture();
  f.call("admin.saveProject", {
    ...f.env.db.Projects.find((p) => p.id === f.a.projectId),
    status: "withdrawn",
  });
  assert.throws(() => f.submit(f.a, f.token), { code: "CLOSED" });
});

test("newly declared conflicts block direct access and exclude preserved prior scores", () => {
  const f = openFixture();
  f.submit(f.a, f.token);
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[0],
    conflicts: [f.a.projectId],
  });
  const token = f.call("auth.judge", { code: f.codes[0] }, "").token;
  assert.throws(
    () => f.call("judge.project", { projectId: f.a.projectId }, token),
    { code: "FORBIDDEN" },
  );
  const result = f
    .call("admin.dashboard")
    .results.find((r) => r.projectId === f.a.projectId);
  assert.equal(result.count, 0);
  assert.ok(result.flags.includes("Conflict of interest"));
  assert.equal(f.env.db.Evaluations.length, 1);
});
