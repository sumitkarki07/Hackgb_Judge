import { requireThat } from "../security/validation.js";
export const currentEvaluation = (db, id) =>
  db.Evaluations.filter((e) => e.assignmentId === id).sort(
    (a, b) => b.version - a.version,
  )[0];
export const completed = (db, id) => {
  const e = currentEvaluation(db, id);
  return !!e && !e.reopenedAt;
};
export function canAssign(judge, project, category) {
  return (
    judge.status === "active" &&
    judge.available &&
    !judge.conflicts.includes(project.id) &&
    (!category.specialist || judge.categories.includes(category.id))
  );
}
// Successive shortest augmenting paths find a complete minimum-cost flow, avoiding greedy dead ends.
export function assignmentPlan(db) {
  const setting = db.Settings[0];
  const active = db.Assignments.filter((a) => a.status === "active");
  const jobs = [];
  const warnings = [];
  for (const p of db.Projects.filter((p) => p.status === "submitted"))
    for (const c of db.Categories.filter(
      (c) => c.active && (c.id === "overall" || p.categories.includes(c.id)),
    )) {
      const assigned = active.filter(
        (a) => a.projectId === p.id && a.categoryId === c.id,
      );
      const target = c.id === "overall" ? setting.target : c.target;
      if (assigned.length > target)
        warnings.push(
          `${p.id} / ${c.name} has ${assigned.length} assignments (target ${target}).`,
        );
      jobs.push({
        p,
        c,
        need: Math.max(0, target - assigned.length),
        assigned,
      });
    }
  const judges = db.Judges.filter((j) => j.status === "active" && j.available);
  const n = 2 + jobs.length + judges.length,
    source = n - 2,
    sink = n - 1;
  const graph = Array.from({ length: n }, () => []);
  function edge(u, v, capacity, cost, meta) {
    const a = {
      to: v,
      rev: graph[v].length,
      capacity,
      cost,
      meta,
      initial: capacity,
    };
    const b = { to: u, rev: graph[u].length, capacity: 0, cost: -cost };
    graph[u].push(a);
    graph[v].push(b);
  }
  let needed = 0;
  jobs.forEach((job, i) => {
    edge(source, i, job.need, 0);
    needed += job.need;
    judges.forEach((j, k) => {
      if (
        canAssign(j, job.p, job.c) &&
        !job.assigned.some((a) => a.judgeId === j.id)
      ) {
        const match = j.expertise.some((e) =>
          `${job.p.description} ${job.p.name}`
            .toLowerCase()
            .includes(e.toLowerCase()),
        );
        edge(
          i,
          jobs.length + k,
          1,
          setting.expertiseMatching && match ? -1 : 0,
          { judgeId: j.id, projectId: job.p.id, categoryId: job.c.id },
        );
      }
    });
  });
  judges.forEach((j, k) => {
    const load = active.filter((a) => a.judgeId === j.id).length;
    for (
      let slot = 0;
      slot < Math.min(needed, Math.max(0, j.capacity - load));
      slot++
    )
      edge(jobs.length + k, sink, 1, (load + slot) * 100);
  });
  let flow = 0;
  while (flow < needed) {
    const distance = Array(n).fill(Infinity),
      prev = Array(n);
    distance[source] = 0;
    for (let pass = 0; pass < n - 1; pass++) {
      let changed = false;
      for (let u = 0; u < n; u++)
        if (Number.isFinite(distance[u]))
          graph[u].forEach((e, i) => {
            if (e.capacity > 0 && distance[e.to] > distance[u] + e.cost) {
              distance[e.to] = distance[u] + e.cost;
              prev[e.to] = [u, i];
              changed = true;
            }
          });
      if (!changed) break;
    }
    if (!prev[sink]) break;
    for (let v = sink; v !== source;) {
      const [u, i] = prev[v];
      const e = graph[u][i];
      e.capacity--;
      graph[v][e.rev].capacity++;
      v = u;
    }
    flow++;
  }
  const additions = graph.flatMap((edges) =>
    edges
      .filter((e) => e.meta && e.initial === 1 && e.capacity === 0)
      .map((e) => e.meta),
  );
  const shortages = jobs
    .map((job) => ({
      projectId: job.p.id,
      categoryId: job.c.id,
      missing:
        job.need -
        additions.filter(
          (a) => a.projectId === job.p.id && a.categoryId === job.c.id,
        ).length,
    }))
    .filter((x) => x.missing > 0);
  return {
    revision: setting.revision,
    additions,
    shortages,
    warnings,
    complete: flow === needed,
    loads: judges.map((j) => ({
      judgeId: j.id,
      name: j.name,
      count:
        active.filter((a) => a.judgeId === j.id).length +
        additions.filter((a) => a.judgeId === j.id).length,
    })),
  };
}
export function validateAssignment(db, judgeId, projectId, categoryId) {
  const j = db.Judges.find((j) => j.id === judgeId),
    p = db.Projects.find((p) => p.id === projectId),
    c = db.Categories.find((c) => c.id === categoryId && c.active);
  requireThat(
    j &&
      p &&
      p.status === "submitted" &&
      c &&
      (c.id === "overall" || p.categories.includes(c.id)) &&
      canAssign(j, p, c),
    "VALIDATION",
    "Judge is unavailable, conflicted, or ineligible for this category/project.",
  );
  requireThat(
    !db.Assignments.some(
      (a) =>
        a.status === "active" &&
        a.judgeId === judgeId &&
        a.projectId === projectId &&
        a.categoryId === categoryId,
    ),
    "DUPLICATE",
    "This assignment already exists.",
  );
  requireThat(
    db.Assignments.filter((a) => a.judgeId === judgeId && a.status === "active")
      .length < j.capacity,
    "CAPACITY",
    "Judge capacity has been reached.",
  );
}
