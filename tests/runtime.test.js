import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
test("Apps Script bundle loads without Node/browser globals and only exposes the guarded gateway", async () => {
  const bundle = await build({
    entryPoints: ["src/server.js"],
    bundle: true,
    format: "iife",
    globalName: "Hub",
    platform: "browser",
    target: "es2020",
    write: false,
  });
  const context = vm.createContext({});
  vm.runInContext(bundle.outputFiles[0].text, context);
  vm.runInContext(await readFile("src/Code.gs", "utf8"), context);
  const publicFunctions = Object.keys(context).filter(
    (k) => typeof context[k] === "function" && !k.endsWith("_"),
  );
  assert.deepEqual(publicFunctions.sort(), ["doGet", "rpc"]);
  const error = context.rpc("admin.dashboard", {}, "");
  assert.equal(error.ok, false);
  assert.equal(error.error.code, "SERVER");
  assert.equal(
    context.Hub.rpc("auth.googleToken", { id_token: "forged" }, "").ok,
    false,
  );
});
