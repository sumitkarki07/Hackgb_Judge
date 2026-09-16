import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
await mkdir("dist", { recursive: true });
const server = await build({
  entryPoints: ["src/server.js"],
  bundle: true,
  format: "iife",
  globalName: "Hub",
  platform: "browser",
  target: "es2020",
  write: false,
  legalComments: "inline",
});
await writeFile("dist/Server.gs", server.outputFiles[0].text);
await copyFile("src/Code.gs", "dist/Code.gs");
await copyFile("src/appsscript.json", "dist/appsscript.json");
const client = await build({
  entryPoints: ["src/ui/app.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
  legalComments: "inline",
});
await writeFile(
  "dist/Scripts.html",
  "<script>\n" +
    client.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") +
    "\n</script>",
);
await writeFile(
  "dist/Styles.html",
  "<style>\n" + (await readFile("src/ui/styles.css", "utf8")) + "\n</style>",
);
await copyFile("src/ui/Index.html", "dist/Index.html");
console.log("Built Apps Script files in dist/ (server, UI, manifest).");
