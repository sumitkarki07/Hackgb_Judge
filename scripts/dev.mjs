import http from "node:http";
import { readFile } from "node:fs/promises";
import { mockEnvironment, seedDemo } from "./mock-env.mjs";
await import("./build.mjs");
let env = seedDemo(mockEnvironment());
const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    if (
      req.method === "POST" &&
      ["/api", "/api/mock/admin", "/api/mock/reset"].includes(req.url)
    ) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1200000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const p = JSON.parse(body || "{}");
      let result;
      try {
        if (req.url === "/api/mock/reset") {
          if (p.confirm !== "RESET LOCAL DEMO")
            throw new Error("Confirm the local reset.");
          env = p.empty ? mockEnvironment() : seedDemo(mockEnvironment());
        }
        env.setTime(Date.now());
        env.deploymentUrl = () => `http://${req.headers.host}/`;
        result = {
          ok: true,
          data: req.url.startsWith("/api/mock/")
            ? env.admin()
            : env.app.dispatch(p.action, p.payload, p.token),
        };
      } catch (e) {
        result = {
          ok: false,
          error: { code: e.code || "SERVER", message: e.message },
        };
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method === "GET" && req.url.split("?")[0] === "/") {
      let html = await readFile("dist/Index.html", "utf8");
      const styles = await readFile("dist/Styles.html", "utf8"),
        scripts = await readFile("dist/Scripts.html", "utf8");
      html = html
        .replace("<?!= include_('Styles'); ?>", () => styles)
        .replace(
          "<?!= include_('Scripts'); ?>",
          () => "<script>window.__LOCAL_DEMO__=true;</script>" + scripts,
        );
      res.setHeader("Content-Type", "text/html;charset=utf-8");
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch {
    res.writeHead(500);
    res.end("Local mock request failed.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `HackGB mock preview: http://localhost:${port} — synthetic data, no Google connection.`,
  ),
);
