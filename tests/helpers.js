import { mockEnvironment } from "../scripts/mock-env.mjs";
export function fixture(projects = 4, judges = 4, target = 3) {
  const env = mockEnvironment(),
    adminToken = env.admin().token,
    call = (a, p = {}, token = adminToken) => env.app.dispatch(a, p, token);
  call("admin.saveSettings", { ...env.db.Settings[0], target });
  for (let i = 0; i < projects; i++)
    call("admin.saveProject", {
      name: `Project ${i}`,
      team: `Team ${i}`,
      description: "Test technology design",
      table: String(i + 1),
      categories: [],
    });
  const codes = [];
  for (let i = 0; i < judges; i++) {
    const j = call("admin.saveJudge", {
      name: `Judge ${i}`,
      email: `judge${i}@example.test`,
      expertise: [],
      available: true,
      capacity: 100,
      conflicts: [],
      categories: [],
    });
    codes.push(call("admin.generateCode", { id: j.id }).code);
  }
  const judgeTokens = codes.map((code) => call("auth.judge", { code }, ""));
  return {
    env,
    call,
    adminToken,
    codes,
    judgeTokens,
    assign() {
      const p = call("admin.assignmentPreview");
      call("admin.applyAssignments", { revision: p.revision });
    },
    open() {
      call("admin.changeState", {
        state: "Ready",
        confirm: "Ready",
        reason: "Prepared",
      });
      call("admin.changeState", {
        state: "Judging Open",
        confirm: "Judging Open",
        reason: "Start",
      });
    },
    submit(a, token, overrides = {}) {
      return call(
        "judge.evaluate",
        {
          assignmentId: a.id,
          scores: { technology: 5, design: 4, completion: 3, learning: 2 },
          notes: "Test",
          requestId: env.random(),
          ...overrides,
        },
        token,
      );
    },
  };
}
