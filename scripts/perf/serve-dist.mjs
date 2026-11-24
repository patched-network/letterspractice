#!/usr/bin/env node
/**
 * Serve a production build (dist/) the way the production server does, for
 * measuring page load locally (scripts/perf/audit-local.sh).
 *
 *   node scripts/perf/serve-dist.mjs [--port 4173] [--dir dist] [--couch <origin>] [--no-br]
 *
 * Serves a file's precompressed `.br` sidecar (scripts/precompress-dist.ts) to
 * clients that accept brotli, as Caddy does with `file_server { precompressed
 * br }`; --no-br models a server without that (gzip only).
 *
 * --couch http://localhost:5984 passes /couch/* through to a real CouchDB
 * (prefix stripped, cookies and all), instead of the no-session answer
 * below: for clicking through a production build signed in, e.g. against
 * the dev couch. Build as audit-local.sh does (couch at this server's /couch).
 * An https origin with a path works too: --couch https://example.com/couch
 * runs a local build (e.g. one linked to unreleased framework code) against
 * production's data. Bodies pass through as sent, compressed or not.
 *
 * Matches the production server where it changes load timing:
 *   - brotli sidecars where present (above), else gzip on text responses
 *     (compressed once, then held in memory)
 *   - the prerendered-page rewrite (scripts/prerender-public.ts header):
 *       /           → /_prerendered/home.html
 *       try_files {path} /_prerendered{path}.html /index.html
 *   - GET /couch/_session answers as CouchDB does for a visitor with no
 *     session. The boot awaits that call before mounting (the data layer's
 *     getLoggedInUsername), so it has to answer, and answer like production.
 *     Build with VITE_COUCH_BASE_URL pointing here (audit-local.sh does).
 *
 * Does not match: HTTP/2 (this is HTTP/1.1), and any other backend call
 * (/couch/*, /express, /auth, /payments → 404). Public pages for a visitor
 * with no session make none of those before mount.
 */
import http from "node:http";
import https from "node:https";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const PORT = Number(opt("port", "4173"));
const ROOT = resolve(opt("dir", "dist"));
const COUCH = opt("couch", null);
const BROTLI = !args.includes("--no-br");

/** --couch: forward a /couch/... request to the real CouchDB, unbuffered. */
function proxyCouch(req, res, path, search) {
  // Append to the origin's own path (new URL(path, base) would drop it).
  const target = new URL(COUCH.replace(/\/$/, "") + (path.replace(/^\/couch/, "") || "/") + search);
  const upstream = (target.protocol === "https:" ? https : http).request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`serve-dist: couch at ${COUCH} unreachable: ${err.message}`);
  });
  req.pipe(upstream);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json|javascript)|image\/svg)/;

const GUEST_SESSION = JSON.stringify({
  ok: true,
  userCtx: { name: null, roles: [] },
  info: { authentication_handlers: ["cookie", "default"] },
});

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** URL path → file under ROOT, by the production rewrite rules. */
async function resolveFile(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const inRoot = (p) => {
    const abs = join(ROOT, p);
    return abs === ROOT || abs.startsWith(ROOT + sep) ? abs : null;
  };
  const candidates =
    safe === "/" ? ["/_prerendered/home.html"] : [safe, `/_prerendered${safe.replace(/\/$/, "")}.html`];
  for (const c of candidates) {
    const abs = inRoot(c);
    if (abs && (await isFile(abs))) return abs;
  }
  return join(ROOT, "index.html");
}

const gzCache = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (COUCH && (path === "/couch" || path.startsWith("/couch/"))) {
    proxyCouch(req, res, path, url.search);
    return;
  }
  if (path === "/couch/_session") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(GUEST_SESSION);
    return;
  }
  if (/^\/(couch|express|auth|payments|backend)(\/|$)/.test(path)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end('{"error":"not_found","reason":"serve-dist.mjs serves no backend"}');
    return;
  }

  const file = await resolveFile(path);
  let body;
  try {
    body = await readFile(file);
  } catch {
    res.writeHead(404);
    res.end();
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers = { "content-type": type };
  const accept = String(req.headers["accept-encoding"] ?? "");
  const acceptsGzip = /\bgzip\b/.test(accept);
  // A precompressed brotli sidecar (scripts/precompress-dist.ts), as Caddy's
  // `file_server { precompressed br }` serves it; --no-br to leave it out.
  const brFile = `${file}.br`;
  if (BROTLI && /\bbr\b/.test(accept) && (await stat(brFile).catch(() => null))?.isFile()) {
    body = await readFile(brFile);
    headers["content-encoding"] = "br";
    headers["vary"] = "Accept-Encoding";
  } else if (acceptsGzip && COMPRESSIBLE.test(type)) {
    // Keyed by mtime too: a rebuild rewrites index.html in place, and a stale
    // copy would point at assets the rebuild deleted.
    const key = `${file}:${(await stat(file)).mtimeMs}`;
    let gz = gzCache.get(key);
    if (!gz) {
      gz = gzipSync(body, { level: 6 });
      gzCache.set(key, gz);
    }
    body = gz;
    headers["content-encoding"] = "gzip";
    headers["vary"] = "Accept-Encoding";
  }
  headers["content-length"] = String(body.length);
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(PORT, () => {
  console.log(`[serve-dist] ${ROOT} on http://localhost:${PORT}` + (COUCH ? `, /couch → ${COUCH}` : ""));
});
