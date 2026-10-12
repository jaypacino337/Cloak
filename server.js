// Tiny zero-dependency static server, used on Railway (or any Node host).
// Vercel and GitHub Pages serve the files directly and don't need this.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};
// Only these get served; everything else (server.js, package.json, .git…) is a 404.
const PUBLIC = new Set(["index.html", "app.html", "404.html", "site.webmanifest", "assets"]);
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (urlPath === "/") urlPath = "/index.html";
    if (urlPath === "/app") urlPath = "/app.html";
    const file = path.normalize(path.join(ROOT, urlPath));
    const top = path.relative(ROOT, file).split(path.sep)[0];
    const notFound = () =>
      fs.readFile(path.join(ROOT, "404.html"), (e, page) => {
        res.writeHead(404, { ...SECURITY, "Content-Type": "text/html; charset=utf-8" });
        res.end(e ? "Not found" : page);
      });
    if (!file.startsWith(ROOT + path.sep) || !PUBLIC.has(top)) return notFound();
    fs.readFile(file, (err, data) => {
      if (err) return notFound();
      const type = TYPES[path.extname(file)] || "application/octet-stream";
      const cache = file.includes(`${path.sep}assets${path.sep}`) && !file.endsWith("config.js") ? "public, max-age=3600" : "no-cache";
      res.writeHead(200, { ...SECURITY, "Content-Type": type, "Cache-Control": cache });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Cloak running on port ${PORT}`));
