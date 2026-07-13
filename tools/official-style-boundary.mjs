import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export async function startOfficialStyleBoundary({
  assetRoot,
  stylesheet = "proofline-brand.css",
  host = "127.0.0.1",
} = {}) {
  if (!assetRoot) {
    throw new Error("An official style asset root is required.");
  }

  const root = resolve(assetRoot);
  const stylesheetPath = resolveInside(root, stylesheet);
  const stylesheetInfo = await stat(stylesheetPath);
  if (!stylesheetInfo.isFile() || extname(stylesheetPath) !== ".css") {
    throw new Error("The official style entry point must be a CSS file.");
  }

  const server = createServer(async (request, response) => {
    setBoundaryHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
      response.end();
      return;
    }

    try {
      const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
      const decodedPath = decodeURIComponent(pathname).replace(/^\/+/u, "");
      const filePath = resolveInside(root, decodedPath);
      const extension = extname(filePath).toLowerCase();
      const contentType = CONTENT_TYPES.get(extension);
      if (!contentType) {
        response.writeHead(404);
        response.end();
        return;
      }

      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }

      const bytes = await readFile(filePath);
      response.writeHead(200, {
        "Content-Length": String(bytes.byteLength),
        "Content-Type": contentType,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      const statusCode =
        error?.code === "ENOENT" || error?.code === "EISDIR" ? 404 : 400;
      response.writeHead(statusCode);
      response.end();
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Official style boundary did not bind a TCP port.");
  }

  let closed = false;
  return {
    stylesheetUrl: `http://${host}:${address.port}/${encodeURI(stylesheet)}`,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolvePromise, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolvePromise();
        });
      });
    },
  };
}

function resolveInside(root, requestedPath) {
  if (!requestedPath || requestedPath.includes("\0")) {
    throw new Error("Invalid official style asset path.");
  }
  const candidate = resolve(root, requestedPath);
  const relativePath = relative(root, candidate);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Official style asset path escapes its root.");
  }
  return candidate;
}

function setBoundaryHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
}
