import {
  text,
  integer,
  oneOf,
  list,
  url,
  rubric,
  validateScores,
  requireThat,
  safeCsv,
} from "../security/validation.js";
import {
  authenticate,
  admin,
  judge,
  issueSession,
  assigned,
} from "../auth/authorization.js";
import {
  assignmentPlan,
  validateAssignment,
  currentEvaluation,
  completed,
} from "./assignments.js";
import { calculateResults, progress } from "./results.js";
import { SCHEMA_VERSION } from "../config/defaults.js";
import Papa from "papaparse";
const clone = (x) => JSON.parse(JSON.stringify(x));
export const publicJudge = (j) => {
  const { verifier, codeVersion, ...safe } = j;
  return safe;
};
const publicProject = (p) => {
  const { members, team, ...safe } = p;
  return safe;
};
export function createApplication(env) {
  function audit(db, session, action, entityId, details = {}) {
    db.AuditLogs.push({
      id: env.random(),
      actor: session.email || session.subject,
      action,
      entityId,
      details,
      createdAt: env.now(),
    });
  }
  function nextId(db, table, prefix) {
    return (
      prefix +
      String(
        db[table].reduce((m, r) => Math.max(m, Number(r.id.slice(1)) || 0), 0) +
          1,
      ).padStart(3, "0")
    );
  }
  function editable(db, allowed = ["Setup"]) {
    requireThat(
      allowed.includes(db.Settings[0].state),
      "CLOSED",
      `This action requires ${allowed.join(" or ")}.`,
    );
  }
  function mutable(db) {
    requireThat(
      !["Finalized", "Archived"].includes(db.Settings[0].state) &&
        !db.Awards.some((a) => a.status === "confirmed"),
      "CLOSED",
      "Results are locked.",
    );
  }
  function settings(db) {
    return db.Settings.find((s) => s.id === "event");
  }
  function category(db, id) {
    const c = db.Categories.find((c) => c.id === id && c.active);
    requireThat(c, "VALIDATION", "Category not found.");
    return c;
  }
  function criteria(db, id) {
    return id === "overall" ? settings(db).rubric : category(db, id).rubric;
  }
  function categoryIds(db, values) {
    return [
      ...new Set(
        list(values || [], "Categories").map((value) => {
          const match = db.Categories.find(
            (c) =>
              c.active &&
              (c.id === value || c.name.toLowerCase() === value.toLowerCase()),
          );
          requireThat(
            match,
            "VALIDATION",
            `Unknown active category: ${value}.`,
          );
          return match.id;
        }),
      ),
    ];
  }
  function eligibleAssignments(db, s, categoryId) {
    const judge = db.Judges.find((j) => j.id === s.subject);
    return db.Assignments.filter(
      (a) =>
        a.judgeId === s.subject &&
        a.categoryId === categoryId &&
        a.status === "active" &&
        !judge.conflicts.includes(a.projectId) &&
        db.Projects.some(
          (p) => p.id === a.projectId && p.status === "submitted",
        ),
    );
  }
  function invalidateRankings(db, judgeId, categoryId) {
    const previous = db.Rankings.find(
      (r) => r.judgeId === judgeId && r.categoryId === categoryId,
    );
    if (previous)
      audit(db, { subject: "system" }, "ranking.invalidate", previous.id, {
        previous,
      });
    db.Rankings = db.Rankings.filter(
      (r) => !(r.judgeId === judgeId && r.categoryId === categoryId),
    );
  }
  function readiness(db) {
    const issues = [];
    if (!db.Projects.some((p) => p.status === "submitted"))
      issues.push("Add at least one submitted project.");
    for (const p of db.Projects.filter((p) => p.status === "submitted"))
      if (!p.table) issues.push(`${p.id}: assign a table number.`);
    const plan = assignmentPlan(db);
    if (plan.additions.length || plan.shortages.length)
      issues.push("Save complete assignments for all active categories.");
    for (const a of db.Assignments.filter((a) => a.status === "active")) {
      const j = db.Judges.find((j) => j.id === a.judgeId);
      if (
        !completed(db, a.id) &&
        (!j ||
          !j.available ||
          j.status !== "active" ||
          j.conflicts.includes(a.projectId) ||
          !j.verifier)
      )
        issues.push(
          `${a.id}: judge is unavailable, conflicted, or has no access code.`,
        );
    }
    return [...new Set(issues)];
  }
  function saveProject(db, p) {
    mutable(db);
    const existing = p.id ? db.Projects.find((x) => x.id === p.id) : null;
    requireThat(!p.id || existing, "VALIDATION", "Project not found.");
    const categories = categoryIds(db, p.categories);
    if (settings(db).state !== "Setup")
      requireThat(
        existing &&
          JSON.stringify(categories.slice().sort()) ===
            JSON.stringify(existing.categories.slice().sort()),
        "CLOSED",
        "Add projects and change category eligibility in Setup.",
      );
    const record = {
      id: existing?.id || nextId(db, "Projects", "H"),
      name: text(p.name, "Project name", 160, true),
      team: text(p.team, "Team name", 160),
      members: text(p.members, "Team members", 2000),
      devpost: url(p.devpost, "Devpost URL"),
      github: url(p.github, "GitHub URL"),
      description: text(p.description, "Description", 5000),
      categories,
      table: text(p.table, "Table", 30),
      status: oneOf(
        p.status || "submitted",
        ["submitted", "withdrawn"],
        "project status",
      ),
      createdAt: existing?.createdAt || env.now(),
    };
    requireThat(
      !db.Projects.some(
        (x) =>
          x.id !== record.id &&
          ((record.devpost &&
            x.devpost.toLowerCase() === record.devpost.toLowerCase()) ||
            (x.name.toLowerCase() === record.name.toLowerCase() &&
              x.team.toLowerCase() === record.team.toLowerCase())),
      ),
      "DUPLICATE",
      "A project with this Devpost URL or name/team already exists.",
    );
    if (existing) {
      for (const a of db.Assignments.filter(
        (a) => a.projectId === existing.id && a.status === "active",
      )) {
        if (existing.status !== record.status)
          invalidateRankings(db, a.judgeId, a.categoryId);
        if (a.categoryId !== "overall" && !categories.includes(a.categoryId)) {
          a.status = "retired";
          invalidateRankings(db, a.judgeId, a.categoryId);
        }
      }
      Object.assign(existing, record);
    } else db.Projects.push(record);
    return record;
  }
  function saveJudge(db, p) {
    mutable(db);
    const existing = p.id ? db.Judges.find((x) => x.id === p.id) : null;
    requireThat(!p.id || existing, "VALIDATION", "Judge not found.");
    const email = text(p.email, "Email", 254, true).toLowerCase();
    requireThat(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      "VALIDATION",
      "Enter a valid email.",
    );
    requireThat(
      !db.Judges.some((j) => j.email === email && j.id !== p.id),
      "DUPLICATE",
      "This judge email already exists.",
    );
    const conflicts = list(p.conflicts || [], "Conflicts");
    for (const id of conflicts)
      requireThat(
        db.Projects.some((p) => p.id === id),
        "VALIDATION",
        `Unknown conflict project ${id}.`,
      );
    const categories = categoryIds(db, p.categories);
    const record = {
      id: existing?.id || nextId(db, "Judges", "J"),
      name: text(p.name, "Judge name", 160, true),
      email,
      expertise: list(p.expertise || [], "Expertise"),
      status: oneOf(
        p.status || "active",
        ["active", "inactive"],
        "judge status",
      ),
      available: p.available !== false,
      capacity: integer(p.capacity ?? 50, "Capacity", 1, 500),
      conflicts,
      categories,
      verifier: existing?.verifier || "",
      codeVersion: existing?.codeVersion || 0,
      createdAt: existing?.createdAt || env.now(),
      lastAccess: existing?.lastAccess || null,
    };
    if (
      existing &&
      (record.status === "inactive" ||
        conflicts.some((id) => !existing.conflicts.includes(id)))
    )
      record.codeVersion++;
    if (
      existing &&
      JSON.stringify(existing.conflicts) !== JSON.stringify(conflicts)
    ) {
      for (const categoryId of new Set(
        db.Assignments.filter((a) => a.judgeId === existing.id).map(
          (a) => a.categoryId,
        ),
      )) {
        invalidateRankings(db, existing.id, categoryId);
      }
    }
    if (existing) Object.assign(existing, record);
    else db.Judges.push(record);
    return publicJudge(record);
  }
  function parseImport(db, p) {
    oneOf(p.kind, ["Projects", "Judges"], "import kind");
    const csv = text(p.csv, "CSV", 1000000, true);
    const parsed = Papa.parse(csv, {
      header: true,
      delimiter: ",",
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
    });
    requireThat(
      !parsed.errors.length &&
        !Object.keys(parsed.meta.renamedHeaders || {}).length,
      "VALIDATION",
      "CSV could not be parsed. Check quotes, duplicate headers, and column counts.",
    );
    requireThat(
      parsed.data.length <= 500,
      "VALIDATION",
      "Import at most 500 rows at once.",
    );
    requireThat(
      p.mapping && typeof p.mapping === "object",
      "VALIDATION",
      "Map CSV columns first.",
    );
    const trial = clone(db),
      rows = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const input = {};
      for (const [field, header] of Object.entries(p.mapping))
        if (header) input[field] = parsed.data[i][header] ?? "";
      for (const k of ["categories", "expertise", "conflicts"])
        if (input[k] !== undefined)
          input[k] = input[k]
            .split(/[;|]/)
            .map((x) => x.trim())
            .filter(Boolean);
      if (input.capacity !== undefined) input.capacity = Number(input.capacity);
      try {
        const record =
          p.kind === "Projects"
            ? saveProject(trial, input)
            : saveJudge(trial, input);
        rows.push({ row: i + 2, status: "ready", record });
      } catch (e) {
        rows.push({
          row: i + 2,
          status: e.code === "DUPLICATE" ? "duplicate" : "error",
          message: e.message,
        });
      }
    }
    return { rows, trial };
  }
  const adminRead = {
    "admin.dashboard": (db) => ({
      settings: settings(db),
      progress: progress(db),
      projects: db.Projects,
      judges: db.Judges.map(publicJudge),
      assignments: db.Assignments,
      evaluations: db.Evaluations,
      rankings: db.Rankings,
      categories: db.Categories,
      results: calculateResults(db),
      awards: db.Awards,
      readiness: readiness(db),
      deploymentUrl: env.deploymentUrl(),
    }),
    "admin.audit": (db) => db.AuditLogs.slice(-1000).reverse(),
    "admin.assignmentPreview": (db) => assignmentPlan(db),
    "admin.importPreview": (db, s, p) => ({ rows: parseImport(db, p).rows }),
    "admin.export": (db, s, p) => {
      oneOf(
        p.table,
        [
          "Projects",
          "Judges",
          "Assignments",
          "Evaluations",
          "Rankings",
          "Results",
          "AuditLogs",
          "Awards",
        ],
        "export",
      );
      const rows =
        p.table === "Judges"
          ? db.Judges.map(publicJudge)
          : p.table === "Results"
            ? calculateResults(db)
            : db[p.table];
      return { filename: `hackgb-${p.table}.csv`, csv: safeCsv(rows) };
    },
  };
  const adminWrite = {
    "admin.saveProject": (db, s, p) => {
      const record = saveProject(db, p);
      audit(db, s, "project.save", record.id, { status: record.status });
      return record;
    },
    "admin.saveJudge": (db, s, p) => {
      const record = saveJudge(db, p);
      audit(db, s, "judge.save", record.id);
      return record;
    },
    "admin.generateCode": (db, s, p) => {
      mutable(db);
      const j = db.Judges.find((j) => j.id === p.id);
      requireThat(j, "VALIDATION", "Judge not found.");
      const code = env
        .random()
        .slice(0, 32)
        .toUpperCase()
        .match(/.{1,4}/g)
        .join("-");
      j.verifier = env.hash("code:" + code.replace(/-/g, ""));
      j.codeVersion++;
      audit(db, s, "judge.code.rotate", j.id);
      return { code, judgeId: j.id };
    },
    "admin.revokeCode": (db, s, p) => {
      mutable(db);
      const j = db.Judges.find((j) => j.id === p.id);
      requireThat(j, "VALIDATION", "Judge not found.");
      j.verifier = "";
      j.codeVersion++;
      audit(db, s, "judge.code.revoke", j.id);
      return { revoked: true };
    },
    "admin.import": (db, s, p) => {
      editable(db);
      const { rows, trial } = parseImport(db, p);
      requireThat(
        !rows.some((r) => r.status === "error"),
        "VALIDATION",
        "Fix all invalid CSV rows before importing.",
      );
      db[p.kind] = trial[p.kind];
      audit(db, s, "import", p.kind, {
        created: rows.filter((r) => r.status === "ready").length,
        duplicates: rows.filter((r) => r.status === "duplicate").length,
      });
      return { rows };
    },
    "admin.applyAssignments": (db, s, p) => {
      editable(db, ["Setup", "Judging Open", "Judging Closed"]);
      requireThat(
        p.revision === settings(db).revision,
        "STALE",
        "Data changed. Generate a new assignment preview.",
      );
      const plan = assignmentPlan(db);
      requireThat(
        plan.complete,
        "CAPACITY",
        "Not enough eligible judge capacity. Resolve all shortages.",
      );
      for (const a of plan.additions) {
        db.Assignments.push({
          ...a,
          id: env.random(),
          status: "active",
          createdAt: env.now(),
        });
        invalidateRankings(db, a.judgeId, a.categoryId);
      }
      audit(db, s, "assignments.auto", "event", {
        count: plan.additions.length,
      });
      return { count: plan.additions.length };
    },
    "admin.assign": (db, s, p) => {
      editable(db, ["Setup", "Judging Open", "Judging Closed"]);
      validateAssignment(db, p.judgeId, p.projectId, p.categoryId);
      const a = {
        id: env.random(),
        judgeId: p.judgeId,
        projectId: p.projectId,
        categoryId: p.categoryId,
        status: "active",
        createdAt: env.now(),
      };
      db.Assignments.push(a);
      invalidateRankings(db, a.judgeId, a.categoryId);
      audit(db, s, "assignment.create", a.id, a);
      return a;
    },
    "admin.reassign": (db, s, p) => {
      editable(db, ["Setup", "Judging Open", "Judging Closed"]);
      const a = db.Assignments.find(
        (a) => a.id === p.id && a.status === "active",
      );
      requireThat(a, "VALIDATION", "Assignment not found.");
      requireThat(
        !currentEvaluation(db, a.id),
        "VALIDATION",
        "An evaluation history exists. Keep this assignment and add a supplemental judge instead.",
      );
      validateAssignment(db, p.judgeId, a.projectId, a.categoryId);
      a.status = "reassigned";
      invalidateRankings(db, a.judgeId, a.categoryId);
      const replacement = {
        ...a,
        id: env.random(),
        judgeId: p.judgeId,
        status: "active",
        createdAt: env.now(),
      };
      db.Assignments.push(replacement);
      invalidateRankings(db, p.judgeId, a.categoryId);
      audit(db, s, "assignment.reassign", a.id, {
        replacement: replacement.id,
        judgeId: p.judgeId,
        reason: text(p.reason, "Reason", 1000, true),
      });
      return replacement;
    },
    "admin.saveSettings": (db, s, p) => {
      editable(db);
      const cfg = settings(db);
      Object.assign(cfg, {
        name: text(p.name, "Event name", 100, true),
        date: text(p.date, "Event date", 100, true),
        venue: text(p.venue, "Venue", 200, true),
        target: integer(p.target, "Judges per project", 1, 20),
        finalists: integer(p.finalists, "Finalist count", 1, 100),
        shortRanking: oneOf(
          p.shortRanking,
          ["available", "requireThree"],
          "short ranking policy",
        ),
        expertiseMatching: p.expertiseMatching === true,
        rubric: rubric(p.rubric),
      });
      const overall = category(db, "overall");
      overall.rubric = cfg.rubric;
      overall.target = cfg.target;
      audit(db, s, "settings.save", "event");
      return cfg;
    },
    "admin.saveCategory": (db, s, p) => {
      editable(db);
      requireThat(
        p.id !== "overall",
        "VALIDATION",
        "Edit the overall rubric in event settings.",
      );
      const existing = p.id ? db.Categories.find((c) => c.id === p.id) : null;
      requireThat(!p.id || existing, "VALIDATION", "Category not found.");
      const c = {
        id: existing?.id || nextId(db, "Categories", "C"),
        name: text(p.name, "Category name", 100, true),
        description: text(p.description, "Description", 2000),
        target: integer(p.target, "Required judges", 1, 20),
        rubric: rubric(p.rubric),
        specialist: p.specialist === true,
        active: p.active !== false,
      };
      requireThat(
        !db.Categories.some(
          (other) =>
            other.id !== c.id &&
            other.name.toLowerCase() === c.name.toLowerCase(),
        ),
        "DUPLICATE",
        "Category names must be unique.",
      );
      if (!c.active)
        for (const a of db.Assignments.filter(
          (a) => a.categoryId === c.id && a.status === "active",
        )) {
          a.status = "retired";
          invalidateRankings(db, a.judgeId, a.categoryId);
        }
      if (existing) Object.assign(existing, c);
      else db.Categories.push(c);
      audit(db, s, "category.save", c.id);
      return c;
    },
    "admin.changeState": (db, s, p) => {
      const cfg = settings(db),
        from = cfg.state;
      const transitions = {
        Setup: ["Ready"],
        Ready: ["Setup", "Judging Open"],
        "Judging Open": ["Judging Closed"],
        "Judging Closed": ["Judging Open", "Deliberation"],
        Deliberation: ["Judging Open", "Finalized"],
        Finalized: ["Archived"],
        Archived: [],
      };
      requireThat(
        transitions[from].includes(p.state),
        "CLOSED",
        "This lifecycle transition is not allowed.",
      );
      requireThat(
        p.confirm === p.state,
        "VALIDATION",
        "Type the destination state to confirm.",
      );
      const reason = text(p.reason, "Reason", 1000, true);
      if (p.state === "Judging Open")
        requireThat(
          !db.Awards.some((a) => a.status === "confirmed"),
          "CLOSED",
          "Confirmed awards lock their underlying judging data.",
        );
      if (["Ready", "Judging Open"].includes(p.state)) {
        const issues = readiness(db);
        requireThat(!issues.length, "NOT_READY", issues.join(" "));
      }
      if (p.state === "Finalized") {
        requireThat(
          db.Categories.filter((c) => c.active).every((c) =>
            db.Awards.some(
              (a) => a.categoryId === c.id && a.status === "confirmed",
            ),
          ),
          "NOT_READY",
          "Confirm at least one award for each active category.",
        );
      }
      cfg.state = p.state;
      audit(db, s, "event.state", "event", { from, to: p.state, reason });
      return cfg;
    },
    "admin.reopenEvaluation": (db, s, p) => {
      mutable(db);
      editable(db, ["Judging Open", "Judging Closed", "Deliberation"]);
      const e = currentEvaluation(db, p.assignmentId);
      requireThat(
        e && !e.reopenedAt,
        "VALIDATION",
        "No completed evaluation to reopen.",
      );
      const reason = text(p.reason, "Correction reason", 1000, true);
      e.reopenedAt = env.now();
      e.reopenReason = reason;
      invalidateRankings(db, e.judgeId, e.categoryId);
      audit(db, s, "evaluation.reopen", e.id, { reason, previous: clone(e) });
      return { reopened: true };
    },
    "admin.award": (db, s, p) => {
      editable(db, ["Deliberation"]);
      const status = oneOf(p.status, ["verified", "confirmed"], "decision");
      const c = category(db, p.categoryId);
      const r = calculateResults(db).find(
        (r) => r.projectId === p.projectId && r.categoryId === c.id,
      );
      requireThat(
        r,
        "VALIDATION",
        "Project is ineligible for this award category.",
      );
      const id = `${c.id}:${r.projectId}`;
      let a = db.Awards.find((a) => a.id === id);
      requireThat(
        a?.status !== "confirmed",
        "CLOSED",
        "This award is confirmed and locked.",
      );
      if (status === "confirmed") {
        requireThat(
          a?.status === "verified",
          "VALIDATION",
          "Verify the finalist before confirming an award.",
        );
        requireThat(
          p.confirm === r.projectId,
          "VALIDATION",
          "Type the project ID to confirm the award.",
        );
        requireThat(
          r.complete || p.override === true,
          "NOT_READY",
          "Resolve incomplete judging, or explicitly acknowledge the exception with a reason.",
        );
      }
      const record = {
        id,
        categoryId: c.id,
        projectId: r.projectId,
        status,
        reason: text(p.reason, "Decision reason", 3000, true),
        actor: s.email,
        updatedAt: env.now(),
      };
      if (a) Object.assign(a, record);
      else db.Awards.push(record);
      audit(db, s, "award." + status, id, {
        reason: record.reason,
        flags: r.flags,
        override: p.override === true,
      });
      return record;
    },
    "admin.backup": (db, s) => {
      const result = env.backup();
      audit(db, s, "backup.create", result.id);
      return result;
    },
    "admin.reconcile": (db, s) => {
      mutable(db);
      audit(db, s, "results.reconcile", "event");
      return { count: calculateResults(db).length };
    },
  };
  const judgeRead = {
    "judge.dashboard": (db, s) => {
      const j = db.Judges.find((j) => j.id === s.subject);
      const assignments = db.Assignments.filter(
        (a) => a.judgeId === s.subject && a.status === "active",
      ).map((a) => ({
        ...a,
        project: publicProject(db.Projects.find((p) => p.id === a.projectId)),
        evaluation: currentEvaluation(db, a.id) || null,
      }));
      return {
        name: j.name,
        settings: settings(db),
        assignments,
        categories: db.Categories.filter((c) =>
          assignments.some((a) => a.categoryId === c.id),
        ),
        rankings: db.Rankings.filter((r) => r.judgeId === s.subject),
      };
    },
    "judge.project": (db, s, p) => {
      const candidates = db.Assignments.filter(
        (a) =>
          a.judgeId === s.subject &&
          a.projectId === p.projectId &&
          a.status === "active",
      );
      requireThat(
        candidates.length,
        "FORBIDDEN",
        "This project is not assigned to you. Please visit one of your assigned teams.",
      );
      requireThat(
        settings(db).state === "Judging Open",
        "CLOSED",
        "Judging is not open.",
      );
      return candidates.map((a) => {
        const { project } = assigned(db, s, a.id);
        return {
          assignment: a,
          project: publicProject(project),
          rubric: criteria(db, a.categoryId),
          evaluation: currentEvaluation(db, a.id) || null,
        };
      });
    },
  };
  const judgeWrite = {
    "judge.evaluate": (db, s, p) => {
      const { assignment: a } = assigned(db, s, p.assignmentId);
      requireThat(
        settings(db).state === "Judging Open",
        "CLOSED",
        "Judging is not open.",
      );
      const existing = currentEvaluation(db, a.id);
      const requestId = text(p.requestId, "Submission ID", 100, true);
      if (existing?.requestId === requestId && !existing.reopenedAt)
        return { evaluation: existing, idempotent: true };
      requireThat(
        !existing || existing.reopenedAt,
        "DUPLICATE",
        "You already submitted this evaluation. Ask an organizer to reopen it for corrections.",
      );
      requireThat(
        (existing?.version || 0) === (p.expectedVersion || 0),
        "STALE",
        "This evaluation changed. Reload before submitting.",
      );
      const scored = validateScores(p.scores, criteria(db, a.categoryId));
      const e = {
        id: env.random(),
        assignmentId: a.id,
        judgeId: s.subject,
        projectId: a.projectId,
        categoryId: a.categoryId,
        ...scored,
        notes: text(p.notes, "Notes", 5000),
        rubric: clone(criteria(db, a.categoryId)),
        version: (existing?.version || 0) + 1,
        requestId,
        submittedAt: env.now(),
        reopenedAt: null,
        reopenReason: "",
      };
      db.Evaluations.push(e);
      audit(
        db,
        s,
        existing ? "evaluation.correct" : "evaluation.submit",
        e.id,
        { assignmentId: a.id, version: e.version },
      );
      return { evaluation: e };
    },
    "judge.rank": (db, s, p) => {
      requireThat(
        settings(db).state === "Judging Open",
        "CLOSED",
        "Judging is not open.",
      );
      category(db, p.categoryId);
      const assignments = eligibleAssignments(db, s, p.categoryId);
      requireThat(
        assignments.length && assignments.every((a) => completed(db, a.id)),
        "NOT_READY",
        "Complete every eligible assignment in this category before ranking.",
      );
      const projects = list(p.projects, "Ranked projects", 3);
      requireThat(
        projects.length === p.projects.length,
        "VALIDATION",
        "Select each project only once.",
      );
      const count = Math.min(3, assignments.length);
      requireThat(
        settings(db).shortRanking === "available" || count === 3,
        "NOT_READY",
        "This event requires three evaluated projects before ranking. Ask an organizer for another assignment.",
      );
      requireThat(
        projects.length === count &&
          projects.every((id) => assignments.some((a) => a.projectId === id)),
        "FORBIDDEN",
        `Choose ${count} distinct projects you were assigned and evaluated.`,
      );
      const id = `${s.subject}:${p.categoryId}`;
      const r = {
        id,
        judgeId: s.subject,
        categoryId: p.categoryId,
        projects,
        submittedAt: env.now(),
      };
      const existing = db.Rankings.find((x) => x.id === id);
      const previous = existing ? clone(existing) : null;
      if (existing) Object.assign(existing, r);
      else db.Rankings.push(r);
      audit(db, s, "ranking.submit", id, { previous, projects });
      return r;
    },
  };
  function run(db, action, p, token) {
    requireThat(
      db.Meta.some((m) => m.id === "schema" && m.version === SCHEMA_VERSION),
      "SCHEMA",
      "Initialize the spreadsheet before use.",
    );
    if (action === "public.event") {
      env.rate("public-event", 300, 60000);
      const { name, date, venue } = settings(db);
      return { name, date, venue };
    }
    if (action === "auth.judge") {
      const code = text(p.code, "Access code", 100, true)
        .toUpperCase()
        .replace(/[\s-]/g, "");
      env.rate("judge-global", 120, 60000);
      env.rate("judge:" + env.hash(code).slice(0, 24), 8, 900000);
      const verifier = env.hash("code:" + code),
        j = db.Judges.find(
          (j) => j.verifier && j.verifier === verifier && j.status === "active",
        );
      requireThat(j, "AUTH", "Invalid or revoked access code.");
      j.lastAccess = env.now();
      return issueSession(db, env, "judge", j.id, "", j.codeVersion);
    }
    if (action === "auth.googleStart") {
      env.rate("google-start", 30, 60000);
      return env.googleStart(db);
    }
    if (action === "auth.googlePoll") {
      env.rate("google-poll", 120, 60000);
      const id = text(p.id, "Sign-in flow", 100, true),
        secret = text(p.secret, "Sign-in proof", 100, true);
      const flow = db.AuthFlows.find(
        (f) =>
          f.id === id &&
          f.pollVerifier === env.hash("poll:" + secret) &&
          f.expiresAt > env.now(),
      );
      requireThat(flow, "AUTH", "Google sign-in expired. Start again.");
      if (flow.status === "pending") return { pending: true };
      requireThat(
        flow.status === "approved" &&
          env.admins().includes(flow.identity.email),
        "FORBIDDEN",
        "This Google account is not approved.",
      );
      flow.status = "consumed";
      const identity = flow.identity;
      flow.identity = null;
      audit(db, { email: identity.email }, "admin.login", identity.sub);
      return issueSession(db, env, "admin", identity.sub, identity.email);
    }
    const s = authenticate(db, token, env);
    if (action === "auth.logout") {
      db.Sessions = db.Sessions.filter((x) => x.id !== s.id);
      return { loggedOut: true };
    }
    if (action.startsWith("admin.")) {
      admin(s);
      if (adminRead[action]) return adminRead[action](db, s, p);
      if (adminWrite[action]) {
        const result = adminWrite[action](db, s, p);
        settings(db).revision++;
        return result;
      }
    }
    if (action.startsWith("judge.")) {
      judge(s);
      if (judgeRead[action]) return judgeRead[action](db, s, p);
      if (judgeWrite[action]) {
        const result = judgeWrite[action](db, s, p);
        settings(db).revision++;
        return result;
      }
    }
    requireThat(false, "NOT_FOUND", "Unknown operation.");
  }
  return {
    dispatch(action, payload = {}, token = "") {
      requireThat(
        typeof action === "string" &&
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          JSON.stringify(payload).length <= 1100000,
        "VALIDATION",
        "Invalid request.",
      );
      return env.transaction((db) => {
        const result = run(db, action, payload, token);
        if (action in adminWrite || action in judgeWrite)
          db.Results = calculateResults(db).map(({ name, status, ...r }) => r);
        return clone(result);
      });
    },
  };
}
