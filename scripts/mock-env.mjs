import { randomBytes, createHmac } from "node:crypto";
import { emptyDatabase, initializeData } from "../src/database/schema.js";
import { createApplication } from "../src/services/application.js";
import { issueSession } from "../src/auth/authorization.js";
import { AppError } from "../src/security/validation.js";
export function mockEnvironment() {
  let now = Date.now(),
    db = initializeData(emptyDatabase(), now),
    locked = false;
  const secret = randomBytes(32),
    rates = new Map();
  const env = {
    now: () => now,
    setTime: (v) => (now = v),
    random: () => randomBytes(32).toString("hex"),
    hash: (v) => createHmac("sha256", secret).update(v).digest("hex"),
    admins: () => ["organizer@example.test"],
    deploymentUrl: () => "http://localhost:4173/",
    backup: () => ({
      id: "isolated-mock-backup",
      url: "http://localhost:4173/",
    }),
    googleStart: () => {
      throw new AppError(
        "CONFIG",
        "Google OAuth is not connected in mock mode.",
      );
    },
    rate: (key, limit, window) => {
      const epoch = Math.floor(now / window),
        r = rates.get(key);
      const count = r?.epoch === epoch ? r.count + 1 : 1;
      rates.set(key, { epoch, count });
      if (count > limit)
        throw new AppError("RATE_LIMIT", "Too many sign-in attempts.");
    },
    transaction: (fn) => {
      if (locked)
        throw new AppError("RETRY", "The server is busy. Please retry.");
      locked = true;
      const copy = structuredClone(db);
      try {
        const result = fn(copy);
        db = copy;
        return result;
      } finally {
        locked = false;
      }
    },
    get db() {
      return db;
    },
    set db(v) {
      db = v;
    },
    setLocked: (v) => (locked = v),
  };
  env.app = createApplication(env);
  env.admin = () =>
    env.transaction((db) =>
      issueSession(
        db,
        env,
        "admin",
        "demo-google-subject",
        "organizer@example.test",
      ),
    );
  return env;
}
export function seedDemo(env) {
  const admin = env.admin().token,
    call = (a, p) => env.app.dispatch(a, p, admin);
  const projects = [
    [
      "Canopy",
      "A smarter way to care for our urban forests.",
      "Team Evergreen",
      "hardware",
    ],
    [
      "AccessMap",
      "Making the world more navigable, one accessible route at a time.",
      "Open Paths",
      "design",
    ],
    [
      "PantryPal",
      "Connecting surplus food with the neighbors who need it.",
      "Good Company",
      "web",
    ],
    [
      "LakeWatch",
      "Low-cost sensors protecting Wisconsin’s freshwater ecosystems.",
      "Blue Current",
      "hardware",
    ],
    [
      "StudyBuddy",
      "An inclusive study companion that grows alongside you.",
      "Late Night Labs",
      "AI",
    ],
    [
      "ReThread",
      "A second life for the clothes already in your closet.",
      "Full Circle",
      "design",
    ],
    [
      "SignalSafe",
      "Community-first emergency alerts, even when networks fail.",
      "Signal Studio",
      "web",
    ],
    [
      "Mindful Minutes",
      "Small moments of calm for a busy campus.",
      "The Reset Team",
      "AI",
    ],
  ];
  projects.forEach(([name, description, team, tag], i) =>
    call("admin.saveProject", {
      name,
      description: description + " Built with " + tag + ".",
      team,
      table: String(i + 1).padStart(2, "0"),
      categories: [],
      status: "submitted",
    }),
  );
  [
    "Alex Morgan",
    "Jamie Rivera",
    "Priya Shah",
    "Jordan Lee",
    "Sam Chen",
    "Taylor Brooks",
  ].forEach((name, i) =>
    call("admin.saveJudge", {
      name,
      email: `judge${i + 1}@example.test`,
      expertise: [["web", "design", "AI", "hardware"][i % 4]],
      available: true,
      status: "active",
      capacity: 20,
      categories: [],
      conflicts: [],
    }),
  );
  for (const j of env.db.Judges) call("admin.generateCode", { id: j.id });
  env.transaction((db) => {
    db.Judges[0].verifier = env.hash("code:DEMOHACKGB2026");
  });
  const plan = call("admin.assignmentPreview");
  call("admin.applyAssignments", { revision: plan.revision });
  call("admin.changeState", {
    state: "Ready",
    confirm: "Ready",
    reason: "Synthetic demo setup",
  });
  call("admin.changeState", {
    state: "Judging Open",
    confirm: "Judging Open",
    reason: "Synthetic demo judging",
  });
  env.transaction((db) => {
    for (const [i, a] of db.Assignments.entries()) {
      if (a.judgeId === "J001" || i % 4 === 0) continue;
      const scores = {
        technology: 3 + (i % 3),
        design: 3 + ((i + 1) % 3),
        completion: 4,
        learning: 5,
      };
      db.Evaluations.push({
        id: env.random(),
        assignmentId: a.id,
        judgeId: a.judgeId,
        projectId: a.projectId,
        categoryId: a.categoryId,
        scores,
        total: Object.values(scores).reduce((a, b) => a + b),
        notes:
          "Synthetic demo evaluation. Thoughtful implementation and a clear demonstration.",
        rubric: db.Settings[0].rubric,
        version: 1,
        requestId: env.random(),
        submittedAt: env.now(),
        reopenedAt: null,
        reopenReason: "",
      });
    }
  });
  return env;
}
