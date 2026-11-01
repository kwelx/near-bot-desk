import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self' https://rpc.testnet.near.org; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

function fileForRequest(urlPath) {
  let pathname = urlPath;
  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (decoded.includes("\0") || decoded.split("/").includes("..")) {
    return null;
  }
  const filePath = resolve(ROOT, decoded);
  const rel = relative(ROOT, filePath);
  if (rel.startsWith("..") || rel === "") {
    return null;
  }
  return filePath;
}

function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const requestPath = url.pathname === "/favicon.ico" ? "/favicon.svg" : url.pathname;
  const filePath = fileForRequest(requestPath);
  if (!filePath) {
    res.writeHead(403, SECURITY_HEADERS);
    res.end("Forbidden");
    return;
  }
  readFile(filePath)
    .then((body) => {
      const type = TYPES[extname(filePath)] || "application/octet-stream";
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404, SECURITY_HEADERS);
      res.end("Not found");
    });
}

export function startServer(port = Number(process.env.PORT || 4173)) {
  const server = createServer(handle);
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveListen(server));
  });
}

function isDirectRun() {
  if (!process.argv[1]) {
    return false;
  }
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectRun()) {
  const server = await startServer();
  const address = server.address();
  console.log(`Bot Desk mock is at http://127.0.0.1:${address.port}`);
}
