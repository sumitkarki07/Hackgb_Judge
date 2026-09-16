import { requireThat } from "../security/validation.js";
export function authenticate(db, token, env) {
  requireThat(
    typeof token === "string" && token.length >= 32 && token.length <= 200,
    "AUTH",
    "Please sign in again.",
  );
  const session = db.Sessions.find(
    (s) => s.id === env.hash("session:" + token),
  );
  requireThat(
    session && session.expiresAt > env.now(),
    "AUTH",
    "Your session has expired. Please sign in again.",
  );
  if (session.role === "admin")
    requireThat(
      env.admins().includes(session.email),
      "FORBIDDEN",
      "This Google account is not approved.",
    );
  else {
    const judge = db.Judges.find((j) => j.id === session.subject);
    requireThat(
      judge &&
        judge.status === "active" &&
        judge.codeVersion === session.version,
      "AUTH",
      "Your judge access has been revoked.",
    );
  }
  return session;
}
export function admin(session) {
  requireThat(
    session.role === "admin",
    "FORBIDDEN",
    "Organizer access is required.",
  );
}
export function judge(session) {
  requireThat(
    session.role === "judge",
    "FORBIDDEN",
    "Judge access is required.",
  );
}
export function issueSession(db, env, role, subject, email = "", version = 0) {
  const token = env.random();
  const expiresAt = env.now() + (role === "admin" ? 2 : 12) * 3600000;
  db.Sessions.push({
    id: env.hash("session:" + token),
    role,
    subject,
    email,
    version,
    expiresAt,
  });
  return { token, role, expiresAt };
}
export function validateGoogleClaims(claims, clientId, nonce, now) {
  requireThat(
    claims &&
      ["https://accounts.google.com", "accounts.google.com"].includes(
        claims.iss,
      ) &&
      claims.aud === clientId &&
      (!claims.azp || claims.azp === clientId) &&
      Number.isFinite(claims.exp) &&
      claims.exp * 1000 > now &&
      Number.isFinite(claims.iat) &&
      claims.iat * 1000 <= now + 60000 &&
      claims.iat * 1000 > now - 600000 &&
      claims.nonce === nonce &&
      claims.email_verified === true &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0 &&
      typeof claims.email === "string",
    "AUTH",
    "Google identity verification failed.",
  );
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: claims.name || claims.email,
  };
}
export function assigned(db, session, assignmentId) {
  judge(session);
  const a = db.Assignments.find(
    (x) =>
      x.id === assignmentId &&
      x.judgeId === session.subject &&
      x.status === "active",
  );
  requireThat(
    a,
    "FORBIDDEN",
    "This project is not assigned to you. Please visit one of your assigned teams.",
  );
  const project = db.Projects.find((x) => x.id === a.projectId);
  requireThat(
    project && project.status === "submitted",
    "CLOSED",
    "This project is not eligible for evaluation.",
  );
  const j = db.Judges.find((j) => j.id === session.subject),
    c = db.Categories.find((c) => c.id === a.categoryId);
  requireThat(
    j &&
      j.available &&
      !j.conflicts.includes(project.id) &&
      c &&
      c.active &&
      (c.id === "overall" || project.categories.includes(c.id)) &&
      (!c.specialist || j.categories.includes(c.id)),
    "FORBIDDEN",
    "This assignment needs organizer review before you can evaluate it.",
  );
  return { assignment: a, project };
}
