export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export function requireThat(condition, code, message) {
  if (!condition) throw new AppError(code, message);
}
export function text(value, label, max = 200, required = false) {
  requireThat(
    typeof value === "string" || value == null,
    "VALIDATION",
    `${label} must be text.`,
  );
  const result = (value ?? "").trim();
  requireThat(
    result.length <= max &&
      (!required || result.length > 0) &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result),
    "VALIDATION",
    `${label} is required or exceeds ${max} characters.`,
  );
  return result;
}
export function integer(value, label, min, max) {
  requireThat(
    Number.isInteger(value) && value >= min && value <= max,
    "VALIDATION",
    `${label} must be a whole number from ${min} to ${max}.`,
  );
  return value;
}
export function oneOf(value, options, label) {
  requireThat(options.includes(value), "VALIDATION", `Invalid ${label}.`);
  return value;
}
export function list(value, label, max = 100) {
  requireThat(
    Array.isArray(value) && value.length <= max,
    "VALIDATION",
    `Invalid ${label}.`,
  );
  return [...new Set(value.map((x) => text(x, label, 150, true)))];
}
export function url(value, label) {
  const v = text(value, label, 1000);
  requireThat(
    !v || /^https:\/\/[^\s/@]+(?:[/:?#][^\s]*)?$/i.test(v),
    "VALIDATION",
    `${label} must be an HTTPS URL.`,
  );
  return v.replace(/\/$/, "");
}
export function rubric(value) {
  requireThat(
    Array.isArray(value) && value.length >= 1 && value.length <= 12,
    "VALIDATION",
    "Use 1–12 rubric criteria.",
  );
  const ids = new Set();
  return value.map((c) => {
    const id = text(c.id, "Criterion ID", 40, true);
    requireThat(
      /^[a-z][a-z0-9_]*$/.test(id) && !ids.has(id),
      "VALIDATION",
      "Criterion IDs must be unique lowercase identifiers.",
    );
    ids.add(id);
    return {
      id,
      name: text(c.name, "Criterion name", 80, true),
      description: text(c.description, "Description", 1000),
      max: integer(c.max, "Maximum score", 1, 20),
    };
  });
}
export function validateScores(scores, criteria) {
  requireThat(
    scores && typeof scores === "object" && !Array.isArray(scores),
    "VALIDATION",
    "Select a score for every criterion.",
  );
  requireThat(
    Object.keys(scores).length === criteria.length,
    "VALIDATION",
    "Select exactly the required criteria.",
  );
  let total = 0;
  const cleaned = {};
  for (const c of criteria) {
    cleaned[c.id] = integer(scores[c.id], c.name, 0, c.max);
    total += cleaned[c.id];
  }
  return { scores: cleaned, total };
}
export function safeCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v) => {
    let s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    "\uFEFF" +
    [headers, ...rows.map((r) => headers.map((h) => r[h]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
