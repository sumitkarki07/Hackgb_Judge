import { requireThat } from "../security/validation.js";
import { validateGoogleClaims } from "./authorization.js";
// Only this server-to-Google HTTPS exchange may supply claims. Never accept browser ID tokens.
export function googleAuthentication(env, props) {
  function config() {
    const clientId = props.getProperty("GOOGLE_CLIENT_ID"),
      secret = props.getProperty("GOOGLE_CLIENT_SECRET"),
      redirect = env.deploymentUrl();
    requireThat(
      clientId &&
        secret &&
        /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(
          redirect,
        ),
      "CONFIG",
      "Organizer Google sign-in has not been configured. See docs/SETUP.md.",
    );
    return { clientId, secret, redirect };
  }
  return {
    start(db) {
      const { clientId, redirect } = config();
      const id = env.random(),
        secret = env.random(),
        nonce = env.random(),
        pkce = env.random();
      db.AuthFlows.push({
        id,
        pollVerifier: env.hash("poll:" + secret),
        nonce,
        pkce,
        expiresAt: env.now() + 300000,
        status: "pending",
        identity: null,
      });
      const params = {
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: "openid email profile",
        state: id,
        nonce,
        prompt: "select_account",
        code_challenge: Utilities.base64EncodeWebSafe(
          Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pkce),
        ).replace(/=+$/, ""),
        code_challenge_method: "S256",
      };
      return {
        id,
        secret,
        url:
          "https://accounts.google.com/o/oauth2/v2/auth?" +
          Object.entries(params)
            .map(
              ([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v),
            )
            .join("&"),
      };
    },
    callback(params) {
      return env.transaction((db) => {
        const flow = db.AuthFlows.find(
          (f) =>
            f.id === params.state &&
            f.status === "pending" &&
            f.expiresAt > env.now(),
        );
        requireThat(flow, "AUTH", "Sign-in expired or already used.");
        flow.status = "denied";
        if (params.error) return { approved: false };
        const { clientId, secret, redirect } = config();
        requireThat(
          typeof params.code === "string" && params.code.length < 4096,
          "AUTH",
          "Missing Google authorization code.",
        );
        const response = UrlFetchApp.fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "post",
            payload: {
              code: params.code,
              client_id: clientId,
              client_secret: secret,
              redirect_uri: redirect,
              grant_type: "authorization_code",
              code_verifier: flow.pkce,
            },
            followRedirects: false,
            validateHttpsCertificates: true,
            muteHttpExceptions: true,
          },
        );
        if (response.getResponseCode() !== 200) return { approved: false };
        // Authenticity comes from authenticated, certificate-validated HTTPS to Google's fixed token endpoint.
        // This is the OIDC server-flow exception documented by Google; no client-supplied JWT is decoded.
        let identity;
        try {
          const tokens = JSON.parse(response.getContentText());
          const pieces = tokens.id_token.split(".");
          requireThat(pieces.length === 3, "AUTH", "Invalid token.");
          const header = JSON.parse(
            Utilities.newBlob(
              Utilities.base64DecodeWebSafe(pieces[0]),
            ).getDataAsString(),
          );
          requireThat(
            header.alg === "RS256",
            "AUTH",
            "Unexpected token algorithm.",
          );
          const claims = JSON.parse(
            Utilities.newBlob(
              Utilities.base64DecodeWebSafe(pieces[1]),
            ).getDataAsString(),
          );
          identity = validateGoogleClaims(
            claims,
            clientId,
            flow.nonce,
            env.now(),
          );
        } catch {
          return { approved: false };
        }
        flow.pkce = "";
        flow.nonce = "";
        if (!env.admins().includes(identity.email)) return { approved: false };
        flow.identity = identity;
        flow.status = "approved";
        return { approved: true };
      });
    },
  };
}
