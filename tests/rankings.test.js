import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
function ranked() {
  const f = fixture(3, 1, 1);
  f.assign();
  f.open();
  const token = f.judgeTokens[0].token;
  for (const a of f.env.db.Assignments) f.submit(a, token);
  return { ...f, token };
}
test("ranking points and rubric averages are separate; top three earns 3,2,1", () => {
  const f = ranked();
  f.call(
    "judge.rank",
    { categoryId: "overall", projects: ["H003", "H001", "H002"] },
    f.token,
  );
  const r = f.call("admin.dashboard").results;
  assert.deepEqual(
    r.map((r) => r.points),
    [3, 2, 1],
  );
  assert.deepEqual(
    r.map((r) => r.average),
    [14, 14, 14],
  );
  assert.ok(r.every((r) => r.complete));
});
test("rankings require complete assignments, distinct eligible projects, and correct count", () => {
  const f = fixture(3, 1, 1);
  f.assign();
  f.open();
  const token = f.judgeTokens[0].token;
  assert.throws(
    () =>
      f.call(
        "judge.rank",
        { categoryId: "overall", projects: ["H001", "H002", "H003"] },
        token,
      ),
    { code: "NOT_READY" },
  );
  for (const a of f.env.db.Assignments) f.submit(a, token);
  for (const projects of [
    ["H001", "H001", "H002"],
    ["H001", "H002", "H999"],
    ["H001"],
  ])
    assert.throws(() =>
      f.call("judge.rank", { categoryId: "overall", projects }, token),
    );
});
test("short ranking policy is explicit and configurable", () => {
  const f = fixture(2, 1, 1);
  f.assign();
  f.open();
  for (const a of f.env.db.Assignments) f.submit(a, f.judgeTokens[0].token);
  f.call(
    "judge.rank",
    { categoryId: "overall", projects: ["H001", "H002"] },
    f.judgeTokens[0].token,
  );
  assert.deepEqual(
    f.call("admin.dashboard").results.map((r) => r.points),
    [3, 2],
  );
  const strict = fixture(2, 1, 1);
  strict.call("admin.saveSettings", {
    ...strict.env.db.Settings[0],
    shortRanking: "requireThree",
  });
  strict.assign();
  strict.open();
  for (const a of strict.env.db.Assignments)
    strict.submit(a, strict.judgeTokens[0].token);
  assert.throws(
    () =>
      strict.call(
        "judge.rank",
        { categoryId: "overall", projects: ["H001", "H002"] },
        strict.judgeTokens[0].token,
      ),
    { code: "NOT_READY" },
  );
});
test("incomplete coverage, missing rankings and ties are flagged", () => {
  const f = fixture();
  const r = f.call("admin.dashboard").results[0];
  assert.equal(r.complete, false);
  assert.ok(r.flags.includes("Unequal coverage"));
  assert.ok(r.flags.includes("Tied ranking points"));
});
test("corrections invalidate rankings until the judge submits again", () => {
  const f = ranked();
  f.call(
    "judge.rank",
    { categoryId: "overall", projects: ["H001", "H002", "H003"] },
    f.token,
  );
  f.call("admin.reopenEvaluation", {
    assignmentId: f.env.db.Assignments[0].id,
    reason: "Correction",
  });
  assert.equal(f.env.db.Rankings.length, 0);
  assert.equal(f.call("admin.dashboard").results[0].complete, false);
});
test("category eligibility, specialist assignment and independent rubric are enforced", () => {
  const f = fixture(2, 2, 1);
  const c = f.call("admin.saveCategory", {
    name: "Best Hardware",
    target: 1,
    specialist: true,
    active: true,
    rubric: [
      {
        id: "hardware",
        name: "Hardware",
        max: 10,
        description: "Physical implementation",
      },
    ],
  });
  f.call("admin.saveProject", { ...f.env.db.Projects[0], categories: [c.id] });
  assert.equal(f.call("admin.assignmentPreview").complete, false);
  f.call("admin.saveJudge", {
    ...f.call("admin.dashboard").judges[0],
    categories: [c.id],
  });
  f.assign();
  f.open();
  const a = f.env.db.Assignments.find((a) => a.categoryId === c.id);
  assert.equal(a.judgeId, "J001");
  f.submit(a, f.judgeTokens[0].token, { scores: { hardware: 9 } });
  assert.equal(
    f.call("admin.dashboard").results.find((r) => r.categoryId === c.id)
      .average,
    9,
  );
  assert.equal(
    f.call("admin.dashboard").results.filter((r) => r.categoryId === c.id)
      .length,
    1,
  );
});
test("human verification precedes awards; confirmed awards and finalized records are locked", () => {
  const f = ranked();
  f.call(
    "judge.rank",
    { categoryId: "overall", projects: ["H001", "H002", "H003"] },
    f.token,
  );
  f.call("admin.changeState", {
    state: "Judging Closed",
    confirm: "Judging Closed",
    reason: "Complete",
  });
  f.call("admin.changeState", {
    state: "Deliberation",
    confirm: "Deliberation",
    reason: "Panel",
  });
  assert.throws(
    () =>
      f.call("admin.award", {
        categoryId: "overall",
        projectId: "H001",
        status: "confirmed",
        confirm: "H001",
        reason: "Winner",
      }),
    { code: "VALIDATION" },
  );
  f.call("admin.award", {
    categoryId: "overall",
    projectId: "H001",
    status: "verified",
    reason: "Demo and eligibility verified",
  });
  f.call("admin.award", {
    categoryId: "overall",
    projectId: "H001",
    status: "confirmed",
    confirm: "H001",
    reason: "Panel decision",
  });
  assert.throws(
    () =>
      f.call("admin.award", {
        categoryId: "overall",
        projectId: "H001",
        status: "verified",
        reason: "Edit",
      }),
    { code: "CLOSED" },
  );
  f.call("admin.changeState", {
    state: "Finalized",
    confirm: "Finalized",
    reason: "Awards approved",
  });
  assert.throws(
    () => f.call("admin.saveProject", { ...f.env.db.Projects[0], table: "99" }),
    { code: "CLOSED" },
  );
  assert.equal(f.call("admin.dashboard").results[0].status, "Confirmed winner");
  f.call("admin.changeState", {
    state: "Archived",
    confirm: "Archived",
    reason: "Event complete",
  });
  assert.throws(
    () =>
      f.call("admin.changeState", {
        state: "Setup",
        confirm: "Setup",
        reason: "New event",
      }),
    { code: "CLOSED" },
  );
});
