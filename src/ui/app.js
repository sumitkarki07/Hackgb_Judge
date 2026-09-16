import Papa from "papaparse";
import { DEFAULT_SETTINGS } from "../config/defaults.js";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  folder: "M3 6h7l2 2h9v12H3z M3 6V4h7l2 2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9",
  assign: "M4 5h5v5H4z M15 14h5v5h-5z M9 7h8v7 M4 17h6 M7 14v6",
  qr: "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h2v2h-2z M20 15v6h-5 M12 3v3 M3 12h6 M12 12h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  pulse: "M2 12h5l3-8 4 16 3-8h5",
  trophy:
    "M7 3h10v6a5 5 0 0 1-10 0z M7 5H3v3a4 4 0 0 0 5 4 M17 5h4v3a4 4 0 0 1-5 4 M12 14v6 M8 21h8",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  clock: "M12 8v5l3 2 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  check: "M5 12l4 4L19 6",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6",
  plus: "M12 5v14 M5 12h14",
  calendar: "M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18",
  pin: "M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13 M15 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  logout: "M9 3H3v18h6 M10 12h11 M17 8l4 4-4 4",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  refresh: "M20 8a8 8 0 1 0 0 8 M20 3v5h-5",
};
const icon = (n) =>
  `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[n] || icons.grid}"/></svg>`;
const brand = () =>
  `<div class="brand"><span class="brand-mark">hg</span><span>HackGB<small>JUDGEHUB</small></span></div>`;
const badge = (s, color = "") =>
  `<span class="badge ${color}"><span class="dot"></span>${escape(s)}</span>`;
const button = (label, action, cls = "", data = "") =>
  `<button class="btn ${cls}" data-action="${action}" ${data}>${label}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const area = (label, name, value = "", extra = "") =>
  `<label class="field ${extra}">${label}<textarea name="${name}">${escape(value)}</textarea></label>`;
const select = (label, name, options, value, extra = "") =>
  `<label class="field">${label}<select name="${name}" ${extra}>${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${escape(v)}" ${v === value ? "selected" : ""}>${escape(t)}</option>`;
    })
    .join("")}</select></label>`;
const empty = (title, body = "") =>
  `<div class="empty">${icon("folder")}<h3>${escape(title)}</h3>${escape(body)}</div>`;
const table = (headers, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const date = (n) =>
  n
    ? new Date(n).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Never";
const nav = [
  ["Overview", "grid"],
  ["Projects", "folder"],
  ["Judges", "users"],
  ["Assignments", "assign"],
  ["QR Codes", "qr"],
  ["Rubric & Settings", "settings"],
  ["Live Judging", "pulse"],
  ["Results", "trophy"],
  ["Export & Backup", "download"],
  ["Audit Logs", "clock"],
];
const local = window.__LOCAL_DEMO__ === true;
const state = {
  event: {
    name: DEFAULT_SETTINGS.name,
    date: DEFAULT_SETTINGS.date,
    venue: DEFAULT_SETTINGS.venue,
  },
  token:
    sessionStorage.getItem("hackgb.admin") ||
    localStorage.getItem("hackgb.judge") ||
    "",
  role: sessionStorage.getItem("hackgb.admin") ? "admin" : "judge",
  page: "Overview",
  data: null,
  intended: "",
  selection: null,
  filters: {},
  poll: null,
  import: null,
};
let toastTimer;
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = "show" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 6500);
}
async function api(action, payload = {}) {
  let result;
  if (local) {
    const res = await fetch("/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload, token: state.token }),
    });
    result = await res.json();
  } else
    result = await new Promise((resolve, reject) =>
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(() =>
          reject(
            new Error(
              "Connection interrupted. Your input is preserved; retry safely.",
            ),
          ),
        )
        .rpc(action, payload, state.token),
    );
  if (!result.ok) {
    if (result.error.code === "AUTH" && state.token) {
      clearSession();
      landing();
    }
    const e = new Error(result.error.message);
    e.code = result.error.code;
    throw e;
  }
  return result.data;
}
function clearSession() {
  state.token = "";
  state.data = null;
  sessionStorage.removeItem("hackgb.admin");
  localStorage.removeItem("hackgb.judge");
  clearInterval(state.poll);
}
function acceptSession(s) {
  state.token = s.token;
  state.role = s.role;
  if (s.role === "admin") sessionStorage.setItem("hackgb.admin", s.token);
  else localStorage.setItem("hackgb.judge", s.token);
}
function demoBar() {
  return local
    ? `<div class="demo-bar">LOCAL DEMO · Synthetic data only · Resets when the server restarts <button data-action="demoAdmin">Explore organizer demo →</button><button data-action="demoReset">Start empty setup</button></div>`
    : "";
}
function landing() {
  $("#app").innerHTML =
    `${demoBar()}<div class="landing"><header class="landing-nav">${brand()}<span class="pill">${icon("calendar")} ${escape(state.event.date)}</span></header><main id="main" class="landing-main"><div><span class="pill"><span class="dot" style="color:var(--green)"></span> THE NEXT BIG IDEA STARTS HERE</span><h1>Great ideas.<br>Thoughtful judging.<br><em>Lasting impact.</em></h1><p class="intro">A little structure for a lot of innovation. Your home for fair, focused judging at ${escape(state.event.name)}.</p><div class="event-info"><div>${icon("calendar")}<span>${escape(state.event.date)}<br>One weekend. Endless possibilities.</span></div><div>${icon("pin")}<span>${escape(state.event.venue)}<br>Built by our community.</span></div></div></div><div class="access-card"><div class="icon-box">${icon("shield")}</div><h2>Welcome to JudgeHub</h2><p>Find your projects. Meet the builders.<br>Help the best ideas move forward.</p><form id="login-form"><label class="field">Your judge access code<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter your unique code" required maxlength="100"></label><div id="login-error" role="alert"></div><button class="btn primary" type="submit">Continue as Judge ${icon("arrow")}</button></form>${local ? '<p class="hint">Demo judge code: <b>DEMO-HACKGB-2026</b></p>' : ""}<div class="divider">Here to organize?</div><button class="btn" data-action="google"><span class="google-g" aria-hidden="true">G</span> Sign in with Google</button><p class="hint" style="text-align:center;margin-top:15px">Organizer access is limited to approved accounts.</p><div id="google-status" class="hint" role="status"></div></div></main><footer class="landing-footer"><span>${escape(state.event.name)} · Made for the moments that matter.</span><span>Secure access. Fair evaluations.</span></footer></div>`;
}
function shell(body) {
  const d = state.data;
  $("#app").innerHTML =
    `<div class="app-shell"><aside class="sidebar">${brand()}<div class="eyebrow">Workspace</div>${nav.map(([name, i], index) => `${index === 6 ? '<div class="eyebrow">Judging & results</div>' : ""}<button class="nav-item ${state.page === name ? "active" : ""}" data-action="nav" data-page="${escape(name)}">${icon(i)}${escape(name)}${state.page === name ? '<span class="nav-dot"></span>' : ""}</button>`).join("")}<div class="sidebar-bottom"><strong>${escape(d.settings.name)}</strong>${escape(d.settings.date)}<br>University of Wisconsin–Green Bay</div></aside><div class="main-area">${demoBar()}<header class="topbar"><div class="flex"><button class="btn small mobile-menu" data-action="menu" aria-label="Toggle navigation">${icon("menu")}</button><div class="breadcrumb">Workspace <span>/</span><b>${escape(state.page)}</b></div></div><div class="flex">${badge(d.settings.state, d.settings.state === "Judging Open" ? "green" : "")}<span class="organizer-label">Organizer</span><span class="avatar">HG</span><button class="btn small" data-action="logout" aria-label="Sign out">${icon("logout")}</button></div></header><main id="main" class="content">${body}<div class="footer-note"><span>HackGB JudgeHub · Organizer workspace</span><span>Private judging data · ${escape(d.settings.name)}</span></div></main></div></div>`;
}
function heading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="flex wrap">${actions}</div></div>`;
}
function evalFor(a) {
  return state.data.evaluations
    .filter((e) => e.assignmentId === a.id)
    .sort((a, b) => b.version - a.version)[0];
}
function isDone(a) {
  const e = evalFor(a);
  return !!e && !e.reopenedAt;
}
function projectRows(projects, compact = false) {
  const d = state.data;
  return projects.map((p) => {
    const a = d.assignments.filter(
        (a) => a.projectId === p.id && a.status === "active",
      ),
      done = a.filter(isDone).length;
    return `<tr><td><span class="table-id">${escape(p.id)}</span></td><td><strong>${escape(p.name)}</strong><small>${escape(p.team || p.description.slice(0, 55))}</small></td><td>${escape(p.table || "—")}</td><td><div class="mini-progress"><progress value="${done}" max="${a.length || 1}"></progress>${done}/${a.length}</div></td><td>${badge(p.status === "withdrawn" ? "Withdrawn" : a.length && done === a.length ? "Complete" : "In progress", p.status === "withdrawn" ? "red" : a.length && done === a.length ? "green" : "amber")}</td>${compact ? "" : `<td>${button("Edit", "editProject", "small", `data-id="${p.id}"`)}</td>`}</tr>`;
  });
}
function overview(live = false) {
  const d = state.data,
    p = d.progress;
  const missing = d.projects.filter(
    (p) =>
      p.status === "submitted" &&
      d.results.some((r) => r.projectId === p.id && !r.complete),
  );
  return (
    heading(
      live ? "Live judging" : "Judging overview",
      live
        ? "A shared view of progress. Updates every 30 seconds."
        : "Good ideas deserve a great judging experience. Let’s keep things moving.",
      button(icon("refresh") + " Refresh", "refresh") +
        button(icon("settings") + " Manage event", "lifecycle", "primary"),
    ) +
    (!live
      ? `<section class="event-banner"><div><div class="eyebrow">HACKGB · ${escape(d.settings.date)}</div><h2>Big ideas. A clear path forward.</h2><p>${escape(d.settings.venue)} · Your judging headquarters</p></div>${button("View assignments " + icon("arrow"), "nav", "lime", 'data-page="Assignments"')}</section>`
      : "") +
    `<div class="stat-grid">${[
      [p.projects, "Total projects", "folder", "Ready to make an impression"],
      [
        p.activeJudges,
        "Active judges",
        "users",
        `${p.judges} judges in your workspace`,
      ],
      [
        p.completed,
        "Evaluations submitted",
        "check",
        `${p.pending} evaluations remaining`,
      ],
      [
        p.percent + "%",
        "Judging completion",
        "pulse",
        `${p.completed} of ${p.total} assignments complete`,
      ],
    ]
      .map(
        ([v, l, i, c]) =>
          `<div class="stat"><div class="stat-top">${l}${icon(i)}</div><strong>${v}</strong><span class="caption">${c}</span></div>`,
      )
      .join(
        "",
      )}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Every evaluation counts</h2>${badge("Live progress", "green")}</div><div class="progress-summary"><div class="progress-ring" style="--percent:${p.percent}"><span>${p.percent}%<small>completed</small></span></div><div class="progress-legend"><div><span><i class="legend-dot"></i>Completed evaluations</span><b>${p.completed}</b></div><div><span><i class="legend-dot pending"></i>Pending evaluations</span><b>${p.pending}</b></div><div style="border-top:1px solid var(--line);padding-top:12px"><span>Total assignments</span><b>${p.total}</b></div></div></div><div class="panel-foot">${icon("refresh")} Automatically refreshed every 30 seconds · Last checked ${escape(date(Date.now()))}</div></section><section class="panel"><div class="panel-head"><h2>Keep things moving</h2></div>${[
      [
        "Assignments",
        "assign",
        "Manage assignments",
        "Give every project a fair audience",
      ],
      [
        "QR Codes",
        "qr",
        "Print table cards",
        "An easy way into each evaluation",
      ],
      [
        "Results",
        "trophy",
        "Review provisional results",
        "See the ideas rising to the top",
      ],
    ]
      .map(
        ([p, i, t, s]) =>
          `<button class="action-row" data-action="nav" data-page="${p}">${icon(i)}<span><strong>${t}</strong><small>${s}</small></span>→</button>`,
      )
      .join(
        "",
      )}</section></div>${d.readiness.length && d.settings.state === "Setup" ? `<div class="notice" style="margin-bottom:20px"><strong>Before you open judging</strong><br>${escape(d.readiness.slice(0, 4).join(" "))}${d.readiness.length > 4 ? ` +${d.readiness.length - 4} more checks` : ""}</div>` : ""}<section class="panel"><div class="panel-head"><h2>Projects to keep an eye on <span class="badge">${missing.length}</span></h2><button class="link-btn" data-action="nav" data-page="Projects">View all projects →</button></div>${missing.length ? table(["ID", "Project", "Table", "Evaluations", "Status"], projectRows(missing.slice(0, 6), true)) : empty("All caught up", p.projects ? "Every project has complete judging data." : "Add your projects to get started.")}</section>${live ? `<section class="panel" style="margin-top:23px"><div class="panel-head"><h2>Judges needing attention</h2></div>${judgeTable(d.judges.filter((j) => !j.available || j.status === "inactive" || d.assignments.some((a) => a.judgeId === j.id && a.status === "active" && !isDone(a))))}</section><section class="panel" style="margin-top:23px"><div class="panel-head"><h2>Provisional standings</h2></div>${resultTable(d.results.slice(0, 10))}</section>` : ""}`
  );
}
function searchToolbar(placeholder, options = "") {
  return `<div class="toolbar"><div class="search">${icon("search")}<input id="search" aria-label="${placeholder}" placeholder="${placeholder}" value="${escape(state.filters.search || "")}"></div>${options}</div>`;
}
function projects() {
  const d = state.data,
    q = (state.filters.search || "").toLowerCase(),
    filter = state.filters.status || "all";
  const rows = d.projects.filter(
    (p) =>
      (p.name + " " + p.id + " " + p.table + " " + p.team)
        .toLowerCase()
        .includes(q) &&
      (filter === "all" ||
        filter === p.status ||
        (filter === "incomplete" &&
          d.results.some((r) => r.projectId === p.id && !r.complete))),
  );
  return (
    heading(
      "Projects",
      "Meet the teams. Keep their details in one place.",
      button(icon("download") + " Import CSV", "importProjects") +
        button(icon("plus") + " Add project", "editProject", "primary"),
    ) +
    searchToolbar(
      "Search projects, teams, or tables…",
      `<select id="filter-status" aria-label="Project status">${["all", "submitted", "withdrawn", "incomplete"].map((s) => `<option ${s === filter ? "selected" : ""}>${s}</option>`).join("")}</select>`,
    ) +
    `<section class="panel">${rows.length ? table(["ID", "Project", "Table", "Evaluations", "Status", ""], projectRows(rows)) : empty("No projects found", "Add a project or import your Devpost CSV.")}</section>`
  );
}
function judgeTable(judges) {
  const d = state.data;
  return judges.length
    ? table(
        ["Judge", "Expertise", "Progress", "Availability", ""],
        judges.map((j) => {
          const a = d.assignments.filter(
            (a) => a.judgeId === j.id && a.status === "active",
          );
          return `<tr><td><strong>${escape(j.name)}</strong><small>${escape(j.id)} · ${escape(j.email)}</small></td><td>${escape(j.expertise.join(", ") || "Generalist")}</td><td>${a.filter(isDone).length} / ${a.length}</td><td>${badge(j.status === "inactive" ? "Inactive" : j.available ? "Available" : "Unavailable", j.status === "active" && j.available ? "green" : "amber")}</td><td><div class="flex">${button("Edit", "editJudge", "small", `data-id="${j.id}"`)}${button("Access code", "code", "small", `data-id="${j.id}"`)}</div></td></tr>`;
        }),
      )
    : empty("No judges found", "Add your judging team to begin.");
}
function judges() {
  const q = (state.filters.search || "").toLowerCase();
  return (
    heading(
      "Judges",
      "The people helping great ideas go further.",
      button(icon("download") + " Import CSV", "importJudges") +
        button(icon("plus") + " Add judge", "editJudge", "primary"),
    ) +
    searchToolbar(
      "Search judges or expertise…",
      `<select id="filter-status" aria-label="Judge status"><option value="all">All judges</option><option value="inactive" ${state.filters.status === "inactive" ? "selected" : ""}>Inactive / unavailable</option></select>`,
    ) +
    `<section class="panel">${judgeTable(state.data.judges.filter((j) => (j.name + " " + j.email + " " + j.expertise.join(" ")).toLowerCase().includes(q) && (state.filters.status !== "inactive" || !j.available || j.status === "inactive")))}</section>`
  );
}
function assignments() {
  const d = state.data,
    q = (state.filters.search || "").toLowerCase(),
    a = d.assignments.filter(
      (a) =>
        a.status === "active" &&
        (
          a.projectId +
          " " +
          a.judgeId +
          " " +
          d.projects.find((p) => p.id === a.projectId)?.name +
          " " +
          d.judges.find((j) => j.id === a.judgeId)?.name
        )
          .toLowerCase()
          .includes(q),
    );
  return (
    heading(
      "Assignments",
      "Balanced workloads. Independent perspectives. Fair coverage.",
      button("Manual assignment", "manualAssign") +
        button(icon("assign") + " Auto-Assign Judges", "autoAssign", "primary"),
    ) +
    `<div class="notice info" style="margin-bottom:20px">Overall target: <strong>${d.settings.target} judges per project.</strong> Auto-assignment preserves existing assignments and evaluations. Preview the plan before saving.</div>` +
    searchToolbar("Search by judge or project…") +
    `<section class="panel">${
      a.length
        ? table(
            ["Project", "Judge", "Category", "Evaluation", ""],
            a.map(
              (a) =>
                `<tr><td><strong>${escape(d.projects.find((p) => p.id === a.projectId)?.name)}</strong><small>${a.projectId}</small></td><td>${escape(d.judges.find((j) => j.id === a.judgeId)?.name)}</td><td>${escape(d.categories.find((c) => c.id === a.categoryId)?.name)}</td><td>${badge(isDone(a) ? "Submitted" : "Pending", isDone(a) ? "green" : "amber")}</td><td>${evalFor(a) ? button("Reopen", "reopen", "small", `data-id="${a.id}"`) : button("Reassign", "reassign", "small", `data-id="${a.id}"`)}</td></tr>`,
            ),
          )
        : empty(
            "No assignments yet",
            "Create a preview to distribute projects among your available judges.",
          )
    }</section>`
  );
}
function resultTable(rows) {
  const d = state.data;
  return rows.length
    ? table(
        [
          "Project",
          "Category",
          "Evaluations",
          "Avg. rubric",
          "Ranking points",
          "Status",
          "Review",
        ],
        rows.map(
          (r) =>
            `<tr><td><strong>${escape(r.name)}</strong><small>${r.projectId}</small></td><td>${escape(d.categories.find((c) => c.id === r.categoryId)?.name)}</td><td>${r.count}</td><td>${r.average === null ? "—" : r.average.toFixed(2)}</td><td><b>${r.points}</b></td><td>${badge(r.status, r.status === "Confirmed winner" ? "green" : r.status === "Incomplete" ? "amber" : "blue")}<small>${escape(r.flags.join(" · "))}</small></td><td>${button("Review", "award", "small", `data-project="${r.projectId}" data-category="${r.categoryId}"`)}</td></tr>`,
        ),
      )
    : empty(
        "No results yet",
        "Results appear as projects and categories are configured.",
      );
}
function results() {
  let rows = [...state.data.results];
  const q = (state.filters.search || "").toLowerCase();
  rows = rows.filter(
    (r) =>
      (r.name + " " + r.projectId).toLowerCase().includes(q) &&
      (!state.filters.category || r.categoryId === state.filters.category),
  );
  if (state.filters.sort === "average")
    rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  return (
    heading(
      "Results & deliberation",
      "Transparent scores. Thoughtful decisions. Every result stays provisional until verified.",
      button(
        icon("download") + " Export results",
        "export",
        "",
        `data-table="Results"`,
      ),
    ) +
    `<div class="notice info" style="margin-bottom:20px">Ranking points determine provisional finalist order, with cutoff ties included. Rubric averages are a separate reference. Category results use their own assignments and rubric. Confirmed awards are locked.</div>` +
    searchToolbar(
      "Search results…",
      `<select id="filter-category" aria-label="Award category"><option value="">All categories</option>${state.data.categories.map((c) => `<option value="${c.id}" ${state.filters.category === c.id ? "selected" : ""}>${escape(c.name)}</option>`).join("")}</select><select id="filter-sort" aria-label="Sort results"><option value="points">Sort: ranking points</option><option value="average" ${state.filters.sort === "average" ? "selected" : ""}>Sort: rubric average</option></select>`,
    ) +
    `<section class="panel">${resultTable(rows)}</section>`
  );
}
function rubricEditor(criteria) {
  return `<div id="rubric-editor">${criteria.map((c) => `<div class="criteria-editor"><div class="rubric-row">${field("ID", "criterionId", c.id, "text", "required")}${field("Name", "criterionName", c.name, "text", "required")}${field("Max", "criterionMax", c.max, "number", 'min="1" max="20" required')}${area("Description", "criterionDescription", c.description, "full")}</div><button type="button" class="link-btn" data-action="removeCriterion">Remove criterion</button></div>`).join("")}</div><button type="button" class="btn small" data-action="addCriterion">${icon("plus")} Add criterion</button>`;
}
function settingsPage() {
  const d = state.data,
    c = d.settings;
  return (
    heading(
      "Rubric & settings",
      "Set the ground rules before judging begins.",
      button("Event lifecycle", "lifecycle", "primary"),
    ) +
    `<div class="notice info" style="margin-bottom:20px">Rubrics and category eligibility can be configured in Setup. Each score starts unselected; judges must make an explicit choice.</div><div class="grid2"><section class="panel"><div class="panel-head"><h2>Event configuration</h2>${badge(c.state)}</div><div class="panel-body"><form id="settings-form"><div class="form-grid">${field("Event name", "name", c.name, "text", "required")}${field("Event date", "date", c.date, "text", "required")}${field("Venue", "venue", c.venue, "text", "required")}${field("Judges per project", "target", c.target, "number", 'min="1" max="20" required')}${field("Provisional finalist count", "finalists", c.finalists, "number", 'min="1" max="100" required')}${select(
      "Fewer than three eligible projects",
      "shortRanking",
      [
        ["available", "Rank all available (3, 2, 1 points)"],
        ["requireThree", "Require three projects"],
      ],
      c.shortRanking,
    )}</div><label class="flex field"><input type="checkbox" name="expertiseMatching" ${c.expertiseMatching ? "checked" : ""}> Prefer technical expertise matches</label><h3>Overall judging rubric</h3>${rubricEditor(c.rubric)}<div class="dialog-actions"><button class="btn primary" ${c.state !== "Setup" ? "disabled" : ""}>Save settings</button></div></form></div></section><section class="panel" style="height:fit-content"><div class="panel-head"><h2>Award categories</h2>${button("Add category", "editCategory", "small")}</div><div class="panel-body stack">${d.categories.map((c) => `<div><div class="split-row"><h3>${escape(c.name)}</h3>${c.id !== "overall" ? button("Edit", "editCategory", "small", `data-id="${c.id}"`) : badge("Default")}</div><p class="hint">${escape(c.description)} · ${c.target} judges · ${c.specialist ? "Specialist judges" : "General judges"} · ${c.active ? "Active" : "Inactive"}</p><p class="hint">${c.rubric.map((r) => `${escape(r.name)} / ${r.max}`).join(" · ")}</p></div>`).join("")}</div></section></div>`
  );
}
function qrPage() {
  const d = state.data;
  return (
    heading(
      "Project table cards",
      "A quick scan. The right project. An easier judging day.",
      button(
        icon("download") + " Download all cards (PDF)",
        "qrPdf",
        "primary",
      ),
    ) +
    `<div class="notice info" style="margin-bottom:20px">Each QR code contains only the deployed website URL and project ID. Judges must sign in and have an active assignment. ${local ? "Demo cards point to this local preview; use the deployed URL for event cards." : ""}</div><div class="qr-grid">${d.projects
      .filter((p) => p.status === "submitted")
      .map(
        (p) =>
          `<article class="panel qr-card"><span class="eyebrow">HACKGB · JUDGEHUB</span><h3>${escape(p.name)}</h3><p>${p.id} · Table ${escape(p.table || "TBA")}</p><img alt="Judging QR code for ${escape(p.name)}" data-qr="${p.id}"><p>Scan. Sign in. Share your perspective.</p>${button("Download card", "qrPdf", "small", `data-id="${p.id}"`)}</article>`,
      )
      .join("")}</div>`
  );
}
function exportPage() {
  return (
    heading(
      "Export & backup",
      "Keep a secure copy of the work behind every decision.",
    ) +
    `<div class="grid2"><section class="panel"><div class="panel-head"><h2>Download judging data</h2>${badge("Organizer only", "blue")}</div><div class="panel-body stack">${["Projects", "Judges", "Assignments", "Evaluations", "Rankings", "Results", "AuditLogs", "Awards"].map((t) => `<div class="split-row"><span style="font-size:13px">${t}</span>${button(icon("download") + " CSV", "export", "small", `data-table="${t}"`)}</div>`).join("")}<p class="hint">Excel-compatible UTF-8 CSV. Judge exports exclude access code verifiers and sessions.</p></div></section><section class="panel" style="height:fit-content"><div class="panel-head"><h2>Private spreadsheet backup</h2></div><div class="panel-body"><p class="hint">Create a restricted Google Drive copy of the complete workbook. Backups contain private records and protected credential verifiers. Keep access limited to your organizing team.</p><div class="dialog-actions">${button("Create backup", "backup", "primary")}</div><hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><h3>Reconcile calculated summaries</h3><p class="hint">Rebuild the Results worksheet from the evaluation and ranking records. The dashboard always calculates from the source records.</p>${button("Reconcile results", "reconcile")}</div></section></div>`
  );
}
async function renderAdmin() {
  let body;
  switch (state.page) {
    case "Projects":
      body = projects();
      break;
    case "Judges":
      body = judges();
      break;
    case "Assignments":
      body = assignments();
      break;
    case "Results":
      body = results();
      break;
    case "Rubric & Settings":
      body = settingsPage();
      break;
    case "QR Codes":
      body = qrPage();
      break;
    case "Export & Backup":
      body = exportPage();
      break;
    case "Audit Logs":
      body =
        heading(
          "Audit logs",
          "A record of significant changes, corrections, and decisions.",
        ) +
        `<section class="panel">${table(
          ["When", "Actor", "Action", "Record", "Details"],
          (state.audit || []).map(
            (a) =>
              `<tr><td>${date(a.createdAt)}</td><td>${escape(a.actor)}</td><td>${escape(a.action)}</td><td class="table-id">${escape(a.entityId).slice(0, 25)}</td><td class="audit-detail">${escape(JSON.stringify(a.details))}</td></tr>`,
          ),
        )}</section>`;
      break;
    default:
      body = overview(state.page === "Live Judging");
  }
  shell(body);
  if (state.page === "QR Codes") await fillQr();
}
function judgeShell(body) {
  const d = state.data;
  $("#app").innerHTML =
    `${demoBar()}<header class="judge-top">${brand()}<div class="flex">${badge(d.settings.state, d.settings.state === "Judging Open" ? "green" : "")}<button class="btn small" data-action="logout">Sign out</button></div></header><main id="main" class="judge-content">${body}</main>`;
}
function judgeDashboard() {
  const d = state.data,
    a = d.assignments,
    done = a.filter((a) => a.evaluation && !a.evaluation.reopenedAt).length,
    q = (state.filters.search || "").toLowerCase();
  judgeShell(
    `<div class="eyebrow muted">YOUR JUDGING DAY</div><h1 style="margin-top:12px">Welcome, ${escape(d.name.split(" ")[0])}.</h1><p class="muted" style="font-size:13px">Meet the teams. Ask good questions. Help great ideas shine.</p><section class="judge-progress"><div class="flex between"><h2>Your perspective makes a difference.</h2><span>${done} / ${a.length}</span></div><p>${a.length - done} evaluations to go. Scan a table QR code or open one of your assigned projects below.</p><progress value="${done}" max="${a.length || 1}"></progress></section>${d.settings.state !== "Judging Open" ? `<div class="notice" style="margin-bottom:20px">Judging is currently ${escape(d.settings.state.toLowerCase())}. You can review your assignments; submissions require judging to be open.</div>` : ""}<div class="flex between wrap" style="margin-bottom:20px"><h2 style="margin:0">Your assigned projects</h2>${button("Your top projects " + icon("trophy"), "rank")}</div>${searchToolbar("Search your projects or tables…")}<div class="project-grid">${
      a
        .filter((a) =>
          (a.project.name + " " + a.projectId + " " + a.project.table)
            .toLowerCase()
            .includes(q),
        )
        .map(
          (a) =>
            `<article class="panel project-card"><div class="flex between"><span class="table-id">${a.projectId} · TABLE ${escape(a.project.table || "TBA")}</span>${badge(a.project.status === "withdrawn" ? "Withdrawn" : a.evaluation && !a.evaluation.reopenedAt ? "Completed" : a.evaluation?.reopenedAt ? "Reopened" : "To evaluate", a.evaluation && !a.evaluation.reopenedAt ? "green" : "amber")}</div><h3>${escape(a.project.name)}</h3><p>${escape(a.project.description.slice(0, 150))}</p><div class="card-bottom"><small>${escape(d.categories.find((c) => c.id === a.categoryId)?.name)}</small>${button(a.evaluation && !a.evaluation.reopenedAt ? "View evaluation" : "Start evaluation " + icon("arrow"), "evaluate", "small", `data-project="${a.projectId}" data-assignment="${a.id}"`)}</div></article>`,
        )
        .join("") ||
      empty(
        "No assigned projects",
        "An organizer will add your assignments shortly.",
      )
    }</div>`,
  );
}
async function openEvaluation(projectId, assignmentId) {
  const options = await api("judge.project", { projectId });
  if (options.length > 1 && !assignmentId) {
    modal(
      "Choose an award category",
      options
        .map(
          (o) =>
            `<div style="margin-bottom:12px">${button(escape(state.data.categories.find((c) => c.id === o.assignment.categoryId)?.name), "evaluate", "", `data-project="${projectId}" data-assignment="${o.assignment.id}"`)}</div>`,
        )
        .join(""),
    );
    return;
  }
  const o = options.find((o) => o.assignment.id === assignmentId) || options[0];
  $("#dialog").close();
  state.selection = o;
  state.page = "Evaluation";
  const submitted = o.evaluation && !o.evaluation.reopenedAt;
  const max = o.rubric.reduce((t, c) => t + c.max, 0);
  judgeShell(
    `<button class="link-btn" data-action="judgeHome">← Back to your projects</button><div class="eyebrow muted" style="margin-top:25px">${o.project.id} · TABLE ${escape(o.project.table)}</div><h1 style="margin-top:10px">${escape(o.project.name)}</h1><p class="muted" style="font-size:13px">${escape(state.data.categories.find((c) => c.id === o.assignment.categoryId)?.name)} · Your independent evaluation</p><div class="evaluation-layout"><section class="panel"><div class="panel-body">${submitted ? '<div class="notice info">Your evaluation was saved. Contact an organizer if a correction is needed.</div>' : o.evaluation?.reopenedAt ? `<div class="notice">Reopened for correction: ${escape(o.evaluation.reopenReason)}. The previous submission remains in the history.</div>` : '<p class="hint">Score each criterion from 0 to its maximum. No score is preselected.</p>'}<form id="evaluation-form" data-request="${crypto.randomUUID()}">${o.rubric.map((c) => `<div class="score-field"><fieldset><legend>${escape(c.name)} <small>/ ${c.max}</small></legend><p>${escape(c.description)}</p><div class="ratings">${Array.from({ length: c.max + 1 }, (_, i) => `<label class="rating"><input type="radio" name="score_${c.id}" value="${i}" required ${submitted && o.evaluation.scores[c.id] === i ? "checked" : ""} ${submitted ? "disabled" : ""}><span>${i}</span></label>`).join("")}</div></fieldset></div>`).join("")}<div style="margin-top:23px">${area("Judge notes (optional)", "notes", submitted ? o.evaluation.notes : "")}</div>${submitted ? "" : `<div class="notice info">Please confirm your choices before submitting. Corrections need an organizer to reopen the evaluation.</div><div class="dialog-actions"><button class="btn primary">Submit Evaluation ${icon("arrow")}</button></div>`}</form></div></section><aside class="panel evaluation-info"><div class="panel-body"><span class="eyebrow muted">YOUR TOTAL</span><div class="score-total"><span id="score-total">${submitted ? o.evaluation.total : "—"}</span> <small>/ ${max}</small></div><p id="score-count">${submitted ? "Evaluation saved" : "Select every criterion to calculate your total."}</p><hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><h3>About this project</h3><p>${escape(o.project.description)}</p>${o.project.devpost ? `<p><a href="${escape(o.project.devpost)}" target="_blank" rel="noopener noreferrer">View on Devpost ↗</a></p>` : ""}${o.project.github ? `<p><a href="${escape(o.project.github)}" target="_blank" rel="noopener noreferrer">GitHub repository ↗</a></p>` : ""}</div></aside></div>`,
  );
}
function modal(title, body) {
  const d = $("#dialog");
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${escape(title)}</h2><button class="close-btn" data-action="close" aria-label="Close dialog">×</button></div><div class="dialog-body">${body}<div id="dialog-error" role="alert"></div></div>`;
  if (!d.open) d.showModal();
}
function formActions(label = "Save changes") {
  return `<div class="dialog-actions"><button type="button" class="btn" data-action="close">Cancel</button><button class="btn primary" type="submit">${label}</button></div>`;
}
function projectForm(id) {
  const p = state.data.projects.find((p) => p.id === id) || {};
  modal(
    p.id ? "Edit " + p.id : "Add a project",
    `<form id="project-form" data-id="${p.id || ""}"><div class="form-grid">${field("Project name", "name", p.name, "text", 'required maxlength="160"')}${field("Team name", "team", p.team)}${field("Table number", "table", p.table)}${select("Submission status", "status", ["submitted", "withdrawn"], p.status || "submitted")}${field("Devpost URL", "devpost", p.devpost, "url")}${field("GitHub repository URL", "github", p.github, "url")}${area("Team members (organizer only)", "members", p.members, "full")}${area("Project description", "description", p.description, "full")}</div><label class="field">Award category eligibility</label>${
      state.data.categories
        .filter((c) => c.active && c.id !== "overall")
        .map(
          (c) =>
            `<label class="flex field"><input type="checkbox" name="categories" value="${c.id}" ${p.categories?.includes(c.id) ? "checked" : ""}>${escape(c.name)}</label>`,
        )
        .join("") ||
      '<p class="hint">Overall awards apply to every submitted project. Add more categories in settings.</p>'
    }${formActions()}</form>`,
  );
}
function judgeForm(id) {
  const j = state.data.judges.find((j) => j.id === id) || {};
  modal(
    j.id ? "Edit " + j.id : "Add a judge",
    `<form id="judge-form" data-id="${j.id || ""}"><div class="form-grid">${field("Name", "name", j.name, "text", "required")}${field("Email", "email", j.email, "email", "required")}${field("Expertise (comma separated)", "expertise", j.expertise?.join(", "))}${field("Maximum assignments", "capacity", j.capacity || 50, "number", 'min="1" max="500" required')}${select("Status", "status", ["active", "inactive"], j.status || "active")}${field("Conflict project IDs (comma separated)", "conflicts", j.conflicts?.join(", "))}</div><label class="flex field"><input type="checkbox" name="available" ${j.available !== false ? "checked" : ""}> Available to judge</label><label class="field">Specialist category access</label>${
      state.data.categories
        .filter((c) => c.specialist && c.active)
        .map(
          (c) =>
            `<label class="flex field"><input type="checkbox" name="categories" value="${c.id}" ${j.categories?.includes(c.id) ? "checked" : ""}>${escape(c.name)}</label>`,
        )
        .join("") || '<p class="hint">No specialist categories configured.</p>'
    }<p class="hint">Marking a judge unavailable preserves existing assignments. Reassign their pending projects in Assignments.</p>${formActions()}</form>`,
  );
}
function readRubric(form) {
  return $$(".criteria-editor", form).map((row) => ({
    id: $("[name=criterionId]", row).value,
    name: $("[name=criterionName]", row).value,
    max: Number($("[name=criterionMax]", row).value),
    description: $("[name=criterionDescription]", row).value,
  }));
}
function categoryForm(id) {
  const c = state.data.categories.find((c) => c.id === id) || {
    rubric: state.data.settings.rubric,
    target: 3,
  };
  modal(
    c.id ? "Edit category" : "Add award category",
    `<form id="category-form" data-id="${c.id || ""}">${field("Category name", "name", c.name, "text", "required")}${area("Eligibility / award description", "description", c.description)}${field("Required judges per project", "target", c.target, "number", 'required min="1" max="20"')}<label class="flex field"><input type="checkbox" name="specialist" ${c.specialist ? "checked" : ""}> Only explicitly designated specialist judges</label><label class="flex field"><input type="checkbox" name="active" ${c.active !== false ? "checked" : ""}> Active award category</label><h3>Published category rubric</h3>${rubricEditor(c.rubric)}${formActions()}</form>`,
  );
}
function manualAssign(id) {
  const d = state.data,
    a = d.assignments.find((a) => a.id === id);
  modal(
    a ? "Reassign pending evaluation" : "Manual assignment",
    `<form id="assignment-form" data-id="${a?.id || ""}">${
      a
        ? `<p class="hint">Replace the judge for ${a.projectId}. The original assignment stays in the history.</p>`
        : select(
            "Project",
            "projectId",
            d.projects
              .filter((p) => p.status === "submitted")
              .map((p) => [p.id, `${p.id} · ${p.name}`]),
          )
    }${select(
      "Judge",
      "judgeId",
      d.judges
        .filter(
          (j) => j.status === "active" && j.available && j.id !== a?.judgeId,
        )
        .map((j) => [j.id, `${j.id} · ${j.name}`]),
    )}${
      a
        ? area("Reason for reassignment", "reason")
        : select(
            "Category",
            "categoryId",
            d.categories.filter((c) => c.active).map((c) => [c.id, c.name]),
            "overall",
          )
    }${formActions("Save assignment")}</form>`,
  );
}
async function autoAssign() {
  const plan = await api("admin.assignmentPreview");
  state.plan = plan;
  modal(
    "Assignment preview",
    `<p class="hint">${plan.additions.length} new assignments. Existing records will be preserved.</p>${plan.shortages.length ? `<div class="notice error"><strong>Insufficient judge capacity</strong><br>${plan.shortages.map((s) => `${s.projectId} / ${escape(s.categoryId)}: ${s.missing} missing`).join("<br>")}</div>` : ""}${plan.warnings.length ? `<div class="notice">${escape(plan.warnings.join(" "))}</div>` : ""}${table(
      ["Judge", "Total workload", "New projects"],
      plan.loads.map(
        (j) =>
          `<tr><td>${escape(j.name)}<small>${j.judgeId}</small></td><td>${j.count}</td><td>${
            plan.additions
              .filter((a) => a.judgeId === j.judgeId)
              .map((a) => `${a.projectId} (${escape(a.categoryId)})`)
              .join(", ") || "—"
          }</td></tr>`,
      ),
    )}<div class="dialog-actions">${button("Cancel", "close")}${button("Save assignment plan", "applyAssignments", "primary", !plan.complete ? "disabled" : "")}</div>`,
  );
}
function lifecycle() {
  const current = state.data.settings.state;
  const transitions = {
    Setup: ["Ready"],
    Ready: ["Setup", "Judging Open"],
    "Judging Open": ["Judging Closed"],
    "Judging Closed": ["Judging Open", "Deliberation"],
    Deliberation: ["Judging Open", "Finalized"],
    Finalized: ["Archived"],
    Archived: [],
  };
  modal(
    "Event lifecycle",
    `<p>Current state: ${badge(current)}</p><div class="notice">Closing judging prevents new evaluations and rankings. Finalization locks event records and confirmed awards. Archiving makes the event read-only.</div>${transitions[current].length ? `<form id="lifecycle-form" style="margin-top:20px">${select("Next state", "state", transitions[current])}${area("Reason for the change", "reason")}${field("Type the destination state exactly to confirm", "confirm", "", "text", 'required autocomplete="off"')}${formActions("Confirm state change")}</form>` : '<p class="hint">This event is archived and read-only. Use the documented backup and new-event process to prepare another year.</p>'}`,
  );
}
function awardForm(projectId, categoryId) {
  const d = state.data,
    r = d.results.find(
      (r) => r.projectId === projectId && r.categoryId === categoryId,
    ),
    a = d.awards.find(
      (a) => a.projectId === projectId && a.categoryId === categoryId,
    );
  const evals = d.assignments
    .filter((a) => a.projectId === projectId && a.categoryId === categoryId)
    .map(evalFor)
    .filter(Boolean);
  modal(
    "Finalist review · " + r.name,
    `<p class="hint">${escape(d.categories.find((c) => c.id === categoryId)?.name)} · ${r.count} evaluations · ${r.average?.toFixed(2) || "—"} rubric average · ${r.points} ranking points</p>${r.flags.length ? `<div class="notice">${escape(r.flags.join(" · "))}</div>` : ""}<div class="stack" style="margin:20px 0">${evals
      .map(
        (e) =>
          `<div><strong style="font-size:12px">${escape(d.judges.find((j) => j.id === e.judgeId)?.name)} · ${e.total} points${e.reopenedAt ? " · REOPENED" : ""}</strong><p class="hint">${escape(
            Object.entries(e.scores)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · "),
          )}<br>${escape(e.notes || "No notes.")}</p></div>`,
      )
      .join(
        "",
      )}</div>${a ? `<div class="notice info">${escape(a.status)} · ${escape(a.reason)} · ${escape(a.actor)}</div>` : ""}${
      d.settings.state === "Deliberation" && a?.status !== "confirmed"
        ? `<form id="award-form" data-project="${projectId}" data-category="${categoryId}" style="margin-top:20px">${select(
            "Decision",
            "status",
            a?.status === "verified"
              ? [
                  ["verified", "Update finalist verification"],
                  ["confirmed", "Confirm award winner"],
                ]
              : [["verified", "Verify finalist"]],
          )}${area("Decision and reason", "reason", a?.reason)}${field("To confirm an award, type the project ID", "confirm")}<label class="flex field"><input type="checkbox" name="override"> Explicitly acknowledge incomplete data if confirming an exception</label>${formActions("Record decision")}</form>`
        : '<p class="hint">Finalist verification and award confirmation are available during Deliberation. Confirmed awards are locked.</p>'
    }`,
  );
}
function importStart(kind) {
  state.import = { kind };
  modal(
    `Import ${kind.toLowerCase()} from CSV`,
    `<p class="hint">Choose a UTF-8 CSV, map its columns, and review validation before saving. Duplicate records are skipped. Up to 500 rows per import. Use semicolons for multiple categories or expertise values.</p><label class="field">CSV file<input type="file" id="csv-file" accept=".csv,text/csv"></label><div id="csv-mapping"></div>`,
  );
}
async function loadCsv(file) {
  if (!file) return;
  if (file.size > 1000000) throw new Error("Choose a CSV smaller than 1 MB.");
  const csv = await file.text(),
    parsed = Papa.parse(csv, {
      header: true,
      delimiter: ",",
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
    });
  if (parsed.errors.length)
    throw new Error("CSV parse error: " + parsed.errors[0].message);
  state.import.csv = csv;
  const fields =
    state.import.kind === "Projects"
      ? [
          "name",
          "team",
          "members",
          "devpost",
          "github",
          "description",
          "categories",
          "table",
          "status",
        ]
      : ["name", "email", "expertise", "capacity"];
  const aliases = {
    name: ["name", "project title", "project name", "title", "judge name"],
    team: ["team", "team name"],
    members: ["team members", "members"],
    devpost: ["devpost", "submission url", "project url", "url"],
    github: ["github", "github url", "source code"],
    description: ["description", "tagline", "project description"],
    table: ["table", "table number"],
    email: ["email", "email address"],
  };
  $("#csv-mapping").innerHTML =
    `<form id="import-map-form"><p class="hint">${parsed.data.length} rows detected. Map name${state.import.kind === "Judges" ? " and email" : ""} at minimum.</p><div class="mapping-grid">${fields
      .map((f) => {
        const match = parsed.meta.fields.find((h) =>
          (aliases[f] || [f]).includes(h.toLowerCase()),
        );
        return select(
          f,
          f,
          [["", "Skip this field"], ...parsed.meta.fields.map((h) => [h, h])],
          match || "",
        );
      })
      .join(
        "",
      )}</div><div class="dialog-actions"><button class="btn primary">Preview import</button></div></form>`;
}
function rankingForm() {
  const d = state.data;
  const cats = d.categories.filter((c) =>
    d.assignments.some((a) => a.categoryId === c.id),
  );
  modal(
    "Your top projects",
    `<p class="hint">After finishing every eligible evaluation in a category, rank your favorites. First earns 3 points, second 2, third 1. Scores stay separate.</p>${
      cats
        .map((c) => {
          const a = d.assignments.filter(
              (a) => a.categoryId === c.id && a.project.status === "submitted",
            ),
            done = a.every((a) => a.evaluation && !a.evaluation.reopenedAt),
            r = d.rankings.find((r) => r.categoryId === c.id),
            count = Math.min(3, a.length);
          return `<form class="rank-form" data-category="${c.id}" style="margin-top:22px"><h3>${escape(c.name)}</h3>${!done ? '<div class="notice">Finish every assigned evaluation in this category first.</div>' : count < 3 && d.settings.shortRanking === "requireThree" ? '<div class="notice">This event requires three evaluated projects. Ask an organizer for another assignment.</div>' : `<p class="hint">${count < 3 ? `You have ${count} eligible projects; rank all ${count}.` : ""}</p>${Array.from({ length: count }, (_, i) => select(`${["First", "Second", "Third"][i]} place · ${3 - i} points`, "rank" + i, [["", "Choose a project"], ...a.map((a) => [a.projectId, `${a.projectId} · ${a.project.name}`])], r?.projects[i] || "", "required")).join("")}<button class="btn primary">Save ranking</button>`}</form>`;
        })
        .join("") || empty("No categories to rank")
    }`,
  );
}
async function refresh(silent = false) {
  if (state.role === "admin") {
    state.data = await api("admin.dashboard");
    if (state.page === "Audit Logs") state.audit = await api("admin.audit");
    if (!silent || !$("#dialog").open) await renderAdmin();
  } else {
    state.data = await api("judge.dashboard");
    if (state.page !== "Evaluation") judgeDashboard();
  }
}
async function start() {
  await refresh();
  clearInterval(state.poll);
  state.poll = setInterval(async () => {
    if (
      document.hidden ||
      $("#dialog").open ||
      !["Overview", "Live Judging", "Results"].includes(state.page) ||
      state.role !== "admin"
    )
      return;
    try {
      await refresh(true);
    } catch (e) {
      toast(e.message, true);
    }
  }, 30000);
  if (state.role === "judge" && state.intended) {
    const id = state.intended;
    state.intended = "";
    try {
      await openEvaluation(id);
    } catch (e) {
      toast(e.message, true);
    }
  }
}
function download(filename, content, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function qrUrl(id) {
  const base = state.data.deploymentUrl;
  if (!base)
    throw new Error("Configure DEPLOYMENT_URL before generating table cards.");
  return base + "?project=" + encodeURIComponent(id);
}
async function fillQr() {
  for (const img of $$("[data-qr]"))
    img.src = await QRCode.toDataURL(qrUrl(img.dataset.qr), {
      width: 360,
      margin: 4,
      errorCorrectionLevel: "M",
    });
}
async function qrPdf(id) {
  const projects = state.data.projects.filter(
    (p) => p.status === "submitted" && (!id || p.id === id),
  );
  if (!projects.length)
    throw new Error("Add projects before generating table cards.");
  const pdf = new jsPDF({ unit: "mm", format: "letter", compress: true });
  for (let i = 0; i < projects.length; i++) {
    if (i && i % 2 === 0) pdf.addPage();
    const p = projects[i],
      y = (i % 2) * 139.7;
    pdf.setDrawColor(220, 230, 223);
    pdf.roundedRect(14, y + 10, 188, 119, 4, 4);
    pdf.setTextColor(16, 45, 55);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("HACKGB  |  JUDGEHUB", 25, y + 24);
    let titleSize = 20;
    pdf.setFontSize(titleSize);
    let lines = pdf.splitTextToSize(p.name.replace(/\s+/g, " "), 160);
    while (lines.length * titleSize * 0.3528 * 1.15 > 22 && titleSize > 8) {
      pdf.setFontSize(--titleSize);
      lines = pdf.splitTextToSize(p.name.replace(/\s+/g, " "), 160);
    }
    pdf.text(lines, 25, y + 38);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text(`${p.id}  /  TABLE ${p.table || "TBA"}`, 25, y + 63);
    pdf.setFontSize(10);
    pdf.text(
      [
        "Scan to open this project.",
        "Sign in with your judge code.",
        "Assigned judges only.",
      ],
      25,
      y + 80,
    );
    const png = await QRCode.toDataURL(qrUrl(p.id), {
      width: 600,
      margin: 4,
      errorCorrectionLevel: "M",
    });
    pdf.addImage(png, "PNG", 131, y + 62, 59, 59);
    pdf.setFontSize(8);
    pdf.text(
      state.data.settings.name +
        "  |  " +
        state.data.settings.date.replace(/[^\x20-\x7E]/g, "-"),
      25,
      y + 118,
    );
  }
  pdf.save(id ? `HackGB-${id}-table-card.pdf` : "HackGB-all-table-cards.pdf");
  toast("Print-ready table cards downloaded.");
}
async function googleSignIn() {
  if (local) {
    toast(
      "Google sign-in requires a deployed and configured Apps Script app. Use the clearly labeled local demo button here.",
    );
    return;
  }
  const popup = window.open(
    "about:blank",
    "hackgb-google",
    "width=520,height=700",
  );
  if (!popup) throw new Error("Allow pop-ups to sign in with Google.");
  try {
    popup.opener = null;
    const flow = await api("auth.googleStart");
    popup.location.href = flow.url;
    $("#google-status").textContent =
      "Complete Google sign-in in the new window. This tab will continue automatically.";
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline && !state.token) {
      await new Promise((r) => setTimeout(r, 3000));
      const result = await api("auth.googlePoll", {
        id: flow.id,
        secret: flow.secret,
      });
      if (!result.pending) {
        acceptSession(result);
        popup.close();
        await start();
        return;
      }
    }
  } catch (e) {
    popup.close();
    throw e;
  }
}
const actions = {
  close: () => $("#dialog").close(),
  menu: () => $(".sidebar").classList.toggle("open"),
  logout: async () => {
    await api("auth.logout");
    clearSession();
    landing();
  },
  demoAdmin: async () => {
    const result = await fetch("/api/mock/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((r) => r.json());
    if (!result.ok) throw new Error("Demo sign-in unavailable.");
    acceptSession(result.data);
    state.page = "Overview";
    await start();
  },
  demoReset: () =>
    modal(
      "Start an empty local event",
      `<p>This clears all synthetic records in this local demo so you can try importing projects and setting up judging. Google data is never accessed.</p><div class="dialog-actions">${button("Cancel", "close")}${button("Reset local demo", "demoResetConfirm", "primary")}</div>`,
    ),
  demoResetConfirm: async () => {
    if (!local) return;
    const result = await fetch("/api/mock/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "RESET LOCAL DEMO", empty: true }),
    }).then((r) => r.json());
    if (!result.ok) throw new Error(result.error.message);
    clearSession();
    acceptSession(result.data);
    state.page = "Overview";
    state.filters = {};
    $("#dialog").close();
    await start();
  },
  google: googleSignIn,
  nav: async (el) => {
    state.page = el.dataset.page;
    state.filters = {};
    await refresh();
  },
  refresh: () => refresh(),
  editProject: (el) => projectForm(el.dataset.id),
  editJudge: (el) => judgeForm(el.dataset.id),
  editCategory: (el) => categoryForm(el.dataset.id),
  manualAssign: () => manualAssign(),
  reassign: (el) => manualAssign(el.dataset.id),
  autoAssign,
  applyAssignments: async () => {
    await api("admin.applyAssignments", { revision: state.plan.revision });
    $("#dialog").close();
    await refresh();
    toast("Assignment plan saved.");
  },
  code: (el) => {
    const j = state.data.judges.find((j) => j.id === el.dataset.id);
    modal(
      "Judge access · " + j.name,
      `<p class="hint">The complete code is shown only when generated. Replacing or revoking it immediately invalidates previous codes and sessions.</p><div id="code-result"></div><div class="dialog-actions">${button("Revoke access", "revoke", "danger", `data-id="${j.id}"`)}${button("Generate replacement code", "generateCode", "primary", `data-id="${j.id}"`)}</div>`,
    );
  },
  generateCode: async (el) => {
    const r = await api("admin.generateCode", { id: el.dataset.id });
    $("#code-result").innerHTML =
      `<p class="notice info">Copy this code now and share it privately with the judge. It cannot be retrieved later.</p><code class="code-output">${escape(r.code)}</code><div style="margin-top:12px">${button("Copy code", "copyCode")}</div>`;
    el.disabled = true;
    toast("New code generated. Previous access revoked.");
  },
  copyCode: async () => {
    await navigator.clipboard.writeText($(".code-output").textContent);
    toast("Code copied. Share it privately.");
  },
  revoke: async (el) => {
    await api("admin.revokeCode", { id: el.dataset.id });
    $("#dialog").close();
    toast("Code and existing sessions revoked.");
  },
  lifecycle,
  reopen: (el) =>
    modal(
      "Reopen evaluation",
      `<form id="reopen-form" data-id="${el.dataset.id}"><p class="hint">The original submission stays in the history. Its ranking is invalidated and the judge may submit a correction while judging is open.</p>${area("Reason for correction", "reason")}${formActions("Reopen evaluation")}</form>`,
    ),
  award: (el) => awardForm(el.dataset.project, el.dataset.category),
  importProjects: () => importStart("Projects"),
  importJudges: () => importStart("Judges"),
  importConfirm: async () => {
    await api("admin.import", state.import);
    $("#dialog").close();
    await refresh();
    toast("Import saved. Duplicate records were skipped.");
  },
  export: async (el) => {
    const r = await api("admin.export", { table: el.dataset.table });
    download(r.filename, r.csv);
    toast("CSV downloaded.");
  },
  backup: async () => {
    const r = await api("admin.backup");
    modal(
      "Backup created",
      `<p>A restricted copy of the workbook has been created.</p><a class="btn primary" href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">Open private backup ↗</a><p class="hint">Use the restore procedure in docs/DEPLOYMENT.md. Never replace live records without a fresh backup and explicit confirmation.</p>`,
    );
  },
  reconcile: async () => {
    await api("admin.reconcile");
    toast("Calculated summaries reconciled.");
  },
  qrPdf: (el) => qrPdf(el.dataset.id),
  evaluate: (el) => openEvaluation(el.dataset.project, el.dataset.assignment),
  judgeHome: async () => {
    state.page = "Dashboard";
    await refresh();
  },
  rank: rankingForm,
  addCriterion: (el) => {
    const editor = $("#rubric-editor", el.closest("form"));
    const holder = document.createElement("div");
    holder.innerHTML = rubricEditor([
      { id: "", name: "", description: "", max: 5 },
    ]);
    editor.appendChild($(".criteria-editor", holder));
  },
  removeCriterion: (el) => el.closest(".criteria-editor").remove(),
};
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  e.preventDefault();
  const fn = actions[el.dataset.action];
  if (!fn) return;
  const disabled = el.disabled;
  el.disabled = true;
  try {
    await fn(el);
  } catch (err) {
    toast(err.message, true);
    const target = $("#dialog-error");
    if (target)
      target.innerHTML = `<div class="notice error" style="margin-top:15px">${escape(err.message)}</div>`;
  } finally {
    if (el.isConnected) el.disabled = disabled;
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target,
    fd = new FormData(form),
    v = Object.fromEntries(fd),
    buttons = $$("button", form);
  buttons.forEach((b) => (b.disabled = true));
  let success = "Changes saved.";
  try {
    switch (form.id) {
      case "login-form": {
        const s = await api("auth.judge", { code: v.code });
        acceptSession(s);
        state.page = "Dashboard";
        await start();
        return;
      }
      case "project-form":
        await api("admin.saveProject", {
          ...v,
          id: form.dataset.id || undefined,
          categories: fd.getAll("categories"),
        });
        break;
      case "judge-form":
        await api("admin.saveJudge", {
          ...v,
          id: form.dataset.id || undefined,
          capacity: Number(v.capacity),
          available: fd.has("available"),
          expertise: v.expertise
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          conflicts: v.conflicts
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          categories: fd.getAll("categories"),
        });
        break;
      case "settings-form":
        await api("admin.saveSettings", {
          ...v,
          target: Number(v.target),
          finalists: Number(v.finalists),
          expertiseMatching: fd.has("expertiseMatching"),
          rubric: readRubric(form),
        });
        break;
      case "category-form":
        await api("admin.saveCategory", {
          ...v,
          id: form.dataset.id || undefined,
          target: Number(v.target),
          active: fd.has("active"),
          specialist: fd.has("specialist"),
          rubric: readRubric(form),
        });
        break;
      case "assignment-form":
        await api(form.dataset.id ? "admin.reassign" : "admin.assign", {
          ...v,
          id: form.dataset.id,
        });
        break;
      case "lifecycle-form":
        await api("admin.changeState", v);
        success = "Event status updated.";
        break;
      case "reopen-form":
        await api("admin.reopenEvaluation", {
          assignmentId: form.dataset.id,
          reason: v.reason,
        });
        success = "Evaluation reopened; previous scores preserved.";
        break;
      case "award-form":
        await api("admin.award", {
          ...v,
          projectId: form.dataset.project,
          categoryId: form.dataset.category,
          override: fd.has("override"),
        });
        success = "Panel decision recorded.";
        break;
      case "import-map-form": {
        state.import.mapping = v;
        const r = await api("admin.importPreview", state.import);
        modal(
          "Review import",
          `<p class="hint">${r.rows.filter((r) => r.status === "ready").length} ready · ${r.rows.filter((r) => r.status === "duplicate").length} duplicates skipped · ${r.rows.filter((r) => r.status === "error").length} errors</p>${table(
            ["CSV row", "Name", "Status"],
            r.rows.map(
              (r) =>
                `<tr><td>${r.row}</td><td>${escape(r.record?.name || "—")}</td><td>${badge(r.status, r.status === "ready" ? "green" : r.status === "error" ? "red" : "amber")}<small>${escape(r.message || "")}</small></td></tr>`,
            ),
          )}<div class="dialog-actions">${button("Cancel", "close")}${button("Confirm import", "importConfirm", "primary", r.rows.some((r) => r.status === "error") ? "disabled" : "")}</div>`,
        );
        return;
      }
      case "evaluation-form": {
        const o = state.selection,
          scores = Object.fromEntries(
            o.rubric.map((c) => [
              c.id,
              fd.has("score_" + c.id) ? Number(v["score_" + c.id]) : null,
            ]),
          );
        await api("judge.evaluate", {
          assignmentId: o.assignment.id,
          scores,
          notes: v.notes,
          requestId: form.dataset.request,
          expectedVersion: o.evaluation?.version || 0,
        });
        state.page = "Dashboard";
        success = "Evaluation saved. Thank you for your perspective!";
        break;
      }
      default:
        if (form.classList.contains("rank-form")) {
          await api("judge.rank", {
            categoryId: form.dataset.category,
            projects: [...fd.values()],
          });
          success = "Your ranking was saved.";
        } else return;
    }
    $("#dialog").close();
    await refresh();
    toast(success);
  } catch (err) {
    toast(err.message, true);
    const target =
      form.id === "login-form" ? $("#login-error") : $("#dialog-error");
    if (target)
      target.innerHTML = `<div class="notice error" style="margin-top:12px">${escape(err.message)}</div>`;
  } finally {
    buttons.forEach((b) => {
      if (b.isConnected) b.disabled = false;
    });
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "csv-file") await loadCsv(e.target.files[0]);
    if (e.target.id.startsWith("filter-")) {
      state.filters[e.target.id.slice(7)] = e.target.value;
      await renderAdmin();
    }
    if (e.target.name?.startsWith("score_")) {
      const selected = $$("input[type=radio]:checked", $("#evaluation-form")),
        count = state.selection.rubric.length;
      $("#score-total").textContent =
        selected.length === count
          ? selected.reduce((n, e) => n + Number(e.value), 0)
          : "—";
      $("#score-count").textContent =
        `${selected.length} of ${count} criteria selected`;
    }
  } catch (err) {
    toast(err.message, true);
  }
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id !== "search") return;
  clearTimeout(searchTimer);
  const value = e.target.value,
    position = e.target.selectionStart;
  searchTimer = setTimeout(async () => {
    state.filters.search = value;
    if (state.role === "admin") await renderAdmin();
    else judgeDashboard();
    const input = $("#search");
    input.focus();
    input.setSelectionRange(position, position);
  }, 180);
});
async function initialize() {
  try {
    state.event = await api("public.event");
  } catch {
    /* The landing page remains usable before owner configuration. */
  }
  if (local)
    state.intended = new URL(location.href).searchParams.get("project") || "";
  else if (window.google?.script?.url)
    await new Promise((resolve) =>
      google.script.url.getLocation((loc) => {
        state.intended = loc.parameter.project || "";
        resolve();
      }),
    );
  if (!/^H\d{3,}$/.test(state.intended)) state.intended = "";
  try {
    if (state.token) {
      await start();
      return;
    }
  } catch (e) {
    clearSession();
    toast(e.message, true);
  }
  landing();
}
$("#dialog").addEventListener("close", () => {
  if (!$("#dialog").open) $("#dialog").replaceChildren();
});
initialize();
