#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { refreshNews } from "./refresh.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const DATA = join(ROOT, "data", "news.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const STALE_MS = 20 * 60 * 60 * 1000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

let refreshLock = null;

async function ensureFresh() {
  let needsRefresh = false;
  try {
    const info = await stat(DATA);
    needsRefresh = Date.now() - info.mtimeMs > STALE_MS;
  } catch {
    needsRefresh = true;
  }
  if (!needsRefresh) return;
  if (!refreshLock) {
    refreshLock = refreshNews()
      .catch((err) => {
        console.error("Daily refresh failed:", err);
      })
      .finally(() => {
        refreshLock = null;
      });
  }
  await refreshLock;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const target = normalize(join(ROOT, decoded === "/" ? "index.html" : decoded));
  const rel = relative(ROOT, target);
  if (rel.startsWith("..") || rel.startsWith(sep)) return null;
  return target;
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function isLoopback(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/refresh")) {
      if (!isLoopback(req)) {
        send(res, 403, "Refresh is only allowed from this machine.");
        return;
      }
      const payload = await refreshNews();
      send(res, 200, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
      return;
    }

    await ensureFresh();
    const filePath = safePath(req.url);
    if (!filePath) {
      send(res, 403, "Forbidden");
      return;
    }
    await access(filePath);
    const type = TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not found");
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`Ai Source → http://127.0.0.1:${PORT}`);
  try {
    const { networkInterfaces } = await import("node:os");
    const nets = networkInterfaces();
    for (const entries of Object.values(nets)) {
      for (const net of entries || []) {
        if (net.family === "IPv4" && !net.internal) {
          console.log(`Home network → http://${net.address}:${PORT}`);
        }
      }
    }
  } catch {
    console.log(`Home network → http://<this-pc-lan-ip>:${PORT}`);
  }
});

if (process.env.OPEN_BROWSER === "1") {
  spawn("xdg-open", [`http://127.0.0.1:${PORT}`], { stdio: "ignore", detached: true }).unref();
}
