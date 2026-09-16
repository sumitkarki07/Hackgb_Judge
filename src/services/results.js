import { completed, currentEvaluation } from "./assignments.js";
export function calculateResults(db) {
  const settings = db.Settings[0];
  const rows = [];
  for (const c of db.Categories.filter((c) => c.active))
    for (const p of db.Projects.filter(
      (p) =>
        p.status === "submitted" &&
        (c.id === "overall" || p.categories.includes(c.id)),
    )) {
      const assignments = db.Assignments.filter(
        (a) =>
          a.status === "active" &&
          a.projectId === p.id &&
          a.categoryId === c.id,
      );
      const evaluations = assignments
        .filter(
          (a) =>
            !db.Judges.find((j) => j.id === a.judgeId)?.conflicts.includes(
              p.id,
            ),
        )
        .map((a) => currentEvaluation(db, a.id))
        .filter((e) => e && !e.reopenedAt);
      const target = c.id === "overall" ? settings.target : c.target;
      const points = db.Rankings.filter((r) => r.categoryId === c.id).reduce(
        (n, r) => {
          const idx = r.projects.indexOf(p.id);
          return n + (idx < 0 ? 0 : 3 - idx);
        },
        0,
      );
      const flags = [];
      if (
        assignments.some((a) =>
          db.Judges.find((j) => j.id === a.judgeId)?.conflicts.includes(p.id),
        )
      )
        flags.push("Conflict of interest");
      if (
        evaluations.length < target ||
        evaluations.length !== assignments.length
      )
        flags.push("Incomplete evaluations");
      if (assignments.length !== target) flags.push("Unequal coverage");
      if (
        assignments.some(
          (a) =>
            !db.Rankings.some(
              (r) => r.judgeId === a.judgeId && r.categoryId === c.id,
            ),
        )
      )
        flags.push("Missing rankings");
      rows.push({
        id: `${c.id}:${p.id}`,
        projectId: p.id,
        name: p.name,
        categoryId: c.id,
        count: evaluations.length,
        average: evaluations.length
          ? evaluations.reduce((s, e) => s + e.total, 0) / evaluations.length
          : null,
        points,
        complete: flags.length === 0,
        flags,
      });
    }
  rows.sort(
    (a, b) =>
      a.categoryId.localeCompare(b.categoryId) ||
      b.points - a.points ||
      a.projectId.localeCompare(b.projectId),
  );
  for (const row of rows) {
    if (
      rows.some(
        (x) =>
          x.id !== row.id &&
          x.categoryId === row.categoryId &&
          x.points === row.points,
      )
    )
      row.flags.push("Tied ranking points");
    const categoryRows = rows.filter((x) => x.categoryId === row.categoryId);
    const cutoff =
      categoryRows[Math.min(settings.finalists, categoryRows.length) - 1]
        ?.points;
    const award = db.Awards.find(
      (a) => a.projectId === row.projectId && a.categoryId === row.categoryId,
    );
    row.status =
      award?.status === "confirmed"
        ? "Confirmed winner"
        : award?.status === "verified"
          ? "Verified finalist"
          : row.complete && row.points >= cutoff
            ? "Provisional finalist"
            : row.complete
              ? "Eligible"
              : "Incomplete";
  }
  return rows;
}
export function progress(db) {
  const active = db.Assignments.filter(
    (a) =>
      a.status === "active" &&
      db.Projects.some((p) => p.id === a.projectId && p.status === "submitted"),
  );
  const done = active.filter((a) => completed(db, a.id)).length;
  return {
    projects: db.Projects.filter((p) => p.status === "submitted").length,
    judges: db.Judges.length,
    activeJudges: db.Judges.filter((j) => j.status === "active" && j.available)
      .length,
    total: active.length,
    completed: done,
    pending: active.length - done,
    percent: active.length ? Math.round((done / active.length) * 100) : 0,
  };
}
