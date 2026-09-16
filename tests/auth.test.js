import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { validateGoogleClaims } from "../src/auth/authorization.js";
test("valid code issues a session; stored verifiers and admin exports contain no codes", () => {
  const f = fixture();
  const s = f.call("auth.judge", { code: f.codes[0] }, "");
  assert.equal(s.role, "judge");
  assert.equal(f.env.db.Judges[0].verifier.includes(f.codes[0]), false);
  const j = f.call("admin.dashboard").judges[0];
  assert.equal(j.verifier, undefined);
  assert.equal(j.codeVersion, undefined);
  assert.ok(
    !f.call("admin.export", { table: "Judges" }).csv.includes("verifier"),
  );
});
test("invalid and revoked codes, expired and revoked sessions are rejected", () => {
  const f = fixture();
  assert.throws(() => f.call("auth.judge", { code: "wrong" }, ""), {
    code: "AUTH",
  });
  f.call("admin.revokeCode", { id: "J001" });
  assert.throws(() => f.call("auth.judge", { code: f.codes[0] }, ""), {
    code: "AUTH",
  });
  assert.throws(() => f.call("judge.dashboard", {}, f.judgeTokens[0].token), {
    code: "AUTH",
  });
  f.env.setTime(f.env.now() + 13 * 3600000);
  assert.throws(() => f.call("judge.dashboard", {}, f.judgeTokens[1].token), {
    code: "AUTH",
  });
});
test("every admin operation rejects a judge and unauthenticated direct calls", () => {
  const f = fixture();
  for (const name of [
    "dashboard",
    "audit",
    "export",
    "saveProject",
    "saveJudge",
    "generateCode",
    "revokeCode",
    "import",
    "importPreview",
    "assignmentPreview",
    "applyAssignments",
    "assign",
    "reassign",
    "saveSettings",
    "saveCategory",
    "changeState",
    "reopenEvaluation",
    "award",
    "backup",
    "reconcile",
  ]) {
    assert.throws(() => f.call("admin." + name, {}, f.judgeTokens[0].token), {
      code: "FORBIDDEN",
    });
    assert.throws(() => f.call("admin." + name, {}, ""), { code: "AUTH" });
  }
});
test("allowlist is rechecked on every organizer request and logout destroys sessions", () => {
  const f = fixture();
  f.env.admins = () => [];
  assert.throws(() => f.call("admin.dashboard"), { code: "FORBIDDEN" });
  f.env.admins = () => ["organizer@example.test"];
  f.call("auth.logout");
  assert.throws(() => f.call("admin.dashboard"), { code: "AUTH" });
});
test("authentication attempts are limited even when they fail", () => {
  const f = fixture();
  for (let i = 0; i < 8; i++)
    assert.throws(() => f.call("auth.judge", { code: "bad" }, ""), {
      code: "AUTH",
    });
  assert.throws(() => f.call("auth.judge", { code: "bad" }, ""), {
    code: "RATE_LIMIT",
  });
});
test("Google claims require verified identity, audience, issuer, nonce, expiry, issued time and authorized party", () => {
  const now = Date.now(),
    claims = {
      iss: "https://accounts.google.com",
      aud: "client",
      azp: "client",
      sub: "stable-sub",
      email: "Admin@Example.test",
      email_verified: true,
      exp: now / 1000 + 100,
      iat: now / 1000,
      nonce: "expected",
    };
  assert.equal(
    validateGoogleClaims(claims, "client", "expected", now).email,
    "admin@example.test",
  );
  for (const bad of [
    { aud: "other" },
    { iss: "attacker" },
    { azp: "other" },
    { nonce: "wrong" },
    { exp: 0 },
    { iat: now / 1000 + 900 },
    { iat: 0 },
    { email_verified: false },
    { sub: "" },
  ])
    assert.throws(
      () =>
        validateGoogleClaims({ ...claims, ...bad }, "client", "expected", now),
      { code: "AUTH" },
    );
});
test("a browser cannot supply a Google token or email as authentication", () => {
  const f = fixture();
  assert.throws(
    () =>
      f.call(
        "auth.googleToken",
        { email: "organizer@example.test", id_token: "forged" },
        "",
      ),
    { code: "AUTH" },
  );
  assert.throws(
    () => f.call("auth.googlePoll", { id: "invented", secret: "invented" }, ""),
    { code: "AUTH" },
  );
});
test("Google polling requires a private proof, is single-use, and rejects unauthorized accounts", () => {
  const f = fixture();
  f.env.transaction((db) =>
    db.AuthFlows.push({
      id: "flow",
      pollVerifier: f.env.hash("poll:secret"),
      expiresAt: f.env.now() + 10000,
      status: "approved",
      identity: { sub: "sub", email: "organizer@example.test" },
    }),
  );
  assert.throws(
    () => f.call("auth.googlePoll", { id: "flow", secret: "wrong" }, ""),
    { code: "AUTH" },
  );
  assert.equal(
    f.call("auth.googlePoll", { id: "flow", secret: "secret" }, "").role,
    "admin",
  );
  assert.throws(
    () => f.call("auth.googlePoll", { id: "flow", secret: "secret" }, ""),
    { code: "FORBIDDEN" },
  );
});

test("unauthenticated event metadata contains only public branding", () => {
  const f = fixture();
  const event = f.call("public.event", {}, "");
  assert.deepEqual(Object.keys(event).sort(), ["date", "name", "venue"]);
});
