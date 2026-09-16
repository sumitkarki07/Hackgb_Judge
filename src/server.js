import { createApplication } from "./services/application.js";
import {
  configuration,
  transaction,
  backup,
  initializeSpreadsheet,
} from "./database/apps-script.js";
import { googleAuthentication } from "./auth/google.js";
import { requireThat } from "./security/validation.js";
function environment() {
  const { p } = configuration();
  const secret = p.getProperty("AUTH_SECRET");
  requireThat(
    /^[a-f0-9]{64}$/i.test(secret || ""),
    "CONFIG",
    "Configure a cryptographically generated AUTH_SECRET in Script Properties.",
  );
  const hash = (value) =>
    Utilities.computeHmacSha256Signature(value, secret)
      .map((b) => (b & 255).toString(16).padStart(2, "0"))
      .join("");
  const env = {
    now: () => Date.now(),
    hash,
    transaction,
    backup,
    admins: () =>
      JSON.parse(p.getProperty("ADMIN_EMAILS") || "[]").map((s) =>
        s.toLowerCase(),
      ),
    deploymentUrl: () => p.getProperty("DEPLOYMENT_URL") || "",
    random: () => {
      const counter = Number(p.getProperty("TOKEN_COUNTER") || "0") + 1;
      requireThat(
        Number.isSafeInteger(counter),
        "CONFIG",
        "Token counter exceeded safe range.",
      );
      p.setProperty("TOKEN_COUNTER", String(counter));
      return hash(
        "random:" + counter + ":" + Date.now() + ":" + Utilities.getUuid(),
      );
    },
    rate: (key, limit, window) => {
      const bucket = key.startsWith("judge:")
        ? "judge-bucket-" + key.slice(6, 8)
        : key;
      const prop = "RATE_" + bucket;
      const epoch = Math.floor(Date.now() / window);
      let r = JSON.parse(p.getProperty(prop) || "null");
      if (!r || r.epoch !== epoch) r = { epoch, count: 0 };
      r.count++;
      p.setProperty(prop, JSON.stringify(r));
      requireThat(
        r.count <= limit,
        "RATE_LIMIT",
        "Too many sign-in attempts. Please wait and try again.",
      );
    },
  };
  const google = googleAuthentication(env, p);
  env.googleStart = (db) => google.start(db);
  env.googleCallback = (params) => google.callback(params);
  return env;
}
export function rpc(action, payload, token) {
  try {
    return {
      ok: true,
      data: createApplication(environment()).dispatch(action, payload, token),
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: e.code || "SERVER",
        message: e.code
          ? e.message
          : "The request could not be confirmed. Your input is preserved; retry safely. If this persists, contact an organizer.",
      },
    };
  }
}
export function callback(params) {
  try {
    return environment().googleCallback(params);
  } catch {
    return { approved: false };
  }
}
export { initializeSpreadsheet };
