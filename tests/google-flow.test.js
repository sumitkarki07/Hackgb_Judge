import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { googleAuthentication } from "../src/auth/google.js";
import { mockEnvironment } from "../scripts/mock-env.mjs";
function fixture() {
  const env = mockEnvironment();
  env.deploymentUrl = () =>
    "https://script.google.com/macros/s/TEST_DEPLOYMENT/exec";
  const props = {
    getProperty: (k) =>
      ({
        GOOGLE_CLIENT_ID: "test-client",
        GOOGLE_CLIENT_SECRET: "test-only-client-secret",
      })[k],
  };
  globalThis.Utilities = {
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (_, v) => [...createHash("sha256").update(v).digest()],
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString("base64url"),
    base64DecodeWebSafe: (s) => Buffer.from(s, "base64url"),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString() }),
  };
  const auth = googleAuthentication(env, props);
  const flow = env.transaction((db) => auth.start(db));
  const stored = env.db.AuthFlows[0];
  const claims = {
    iss: "https://accounts.google.com",
    aud: "test-client",
    azp: "test-client",
    nonce: stored.nonce,
    exp: env.now() / 1000 + 300,
    iat: env.now() / 1000,
    sub: "google-subject",
    email: "organizer@example.test",
    email_verified: true,
  };
  const requests = [];
  function respond(change = {}, status = 200) {
    globalThis.UrlFetchApp = {
      fetch: (url, options) => {
        requests.push({ url, options });
        const token =
          [
            { alg: "RS256", kid: "google-key" },
            { ...claims, ...change },
          ]
            .map((x) => Buffer.from(JSON.stringify(x)).toString("base64url"))
            .join(".") + ".fixture-signature";
        return {
          getResponseCode: () => status,
          getContentText: () =>
            JSON.stringify({
              id_token: token,
              access_token: "fixture-access-token",
            }),
        };
      },
    };
  }
  respond();
  return { env, auth, flow, stored, claims, requests, respond };
}
test("OAuth begins with state, nonce, S256 PKCE and an independent private polling proof", () => {
  const f = fixture(),
    url = new URL(f.flow.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), f.flow.id);
  assert.equal(url.searchParams.get("nonce"), f.stored.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(f.stored.pkce).digest("base64url"),
  );
  assert.ok(!f.flow.url.includes(f.flow.secret));
  assert.ok(!f.flow.url.includes("test-only-client-secret"));
  assert.equal(f.stored.pollVerifier, f.env.hash("poll:" + f.flow.secret));
});
test("callback exchanges only with the fixed Google HTTPS endpoint, then consumes state", () => {
  const f = fixture();
  assert.equal(
    f.auth.callback({
      state: f.flow.id,
      code: "fixture-auth-code",
      email: "attacker@example.test",
    }).approved,
    true,
  );
  assert.equal(f.requests[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(f.requests[0].options.followRedirects, false);
  assert.equal(f.requests[0].options.validateHttpsCertificates, true);
  assert.equal(f.requests[0].options.payload.code_verifier, f.stored.pkce);
  assert.equal(f.env.db.AuthFlows[0].identity.email, "organizer@example.test");
  assert.equal(f.env.db.AuthFlows[0].pkce, "");
  assert.throws(() => f.auth.callback({ state: f.flow.id, code: "again" }), {
    code: "AUTH",
  });
  assert.ok(!JSON.stringify(f.env.db).includes("fixture-access-token"));
});
test("callback rejects wrong nonce, audience, unapproved account, expired identity and failed exchange", () => {
  for (const change of [
    { nonce: "wrong" },
    { aud: "other" },
    { email: "outsider@example.test" },
    { exp: 0 },
  ]) {
    const f = fixture();
    f.respond(change);
    assert.equal(
      f.auth.callback({ state: f.flow.id, code: "fixture" }).approved,
      false,
    );
    assert.equal(f.env.db.AuthFlows[0].status, "denied");
  }
  const f = fixture();
  f.respond({}, 400);
  assert.equal(
    f.auth.callback({ state: f.flow.id, code: "bad" }).approved,
    false,
  );
});
test("missing or expired OAuth state never reaches the token endpoint", () => {
  const f = fixture();
  assert.throws(() => f.auth.callback({ state: "invented", code: "fixture" }), {
    code: "AUTH",
  });
  f.env.setTime(f.env.now() + 301000);
  assert.throws(() => f.auth.callback({ state: f.flow.id, code: "fixture" }), {
    code: "AUTH",
  });
  assert.equal(f.requests.length, 0);
});
