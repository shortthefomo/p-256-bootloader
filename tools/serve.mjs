// Serves the signer and the hook wasm. The on-ledger wallet navigates here
// for the iPhone prompt, then returns to https://pwa.passkey.xahau-dev.net/<account>.

import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
};

await mkdir(path.join(root, "public", "vendor"), { recursive: true });
await copyFile(
  path.join(root, "node_modules", "xrpl-accountlib", "dist", "browser-class.min.js"),
  path.join(root, "public", "vendor", "xrpl-accountlib.js"),
);

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean === "/" || clean === "") return path.join(root, "public", "signer.html");
  const underSrc = clean.startsWith("/src/");
  const base = underSrc ? root : path.join(root, "public");
  const rel = underSrc ? clean.slice(1) : clean.slice(1);
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base + path.sep) && full !== base) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const full = fileFor(req.url || "/");
    if (!full) {
      res.writeHead(400).end("bad path");
      return;
    }
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    const type = types[path.extname(full)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(full).pipe(res);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(error.message);
  }
});

server.listen(port, host, () => {
  const origin = `http://${host}:${port}`;
  console.log(`signer  ${origin}/signer.html`);
  console.log(`origin  ${origin} (${origin.length} characters, hook allows 8..64)`);
  console.log("The iPhone passkey is created on this origin. The wallet UI is the account's AppLoader.");
});
