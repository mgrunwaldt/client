import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { resolve } from "node:path";

import {
  previewCacheControl,
  previewContentType,
  resolvePreviewRequestPath,
} from "./e2e-preview-support.mjs";

const [, , rootArgument, keyPath, certificatePath] = process.argv;
if (!rootArgument || !keyPath || !certificatePath) {
  throw new Error(
    "E2E preview requires a build directory, TLS key, and TLS certificate.",
  );
}

const root = resolve(rootArgument);

const server = createServer(
  {
    key: await readFile(keyPath),
    cert: await readFile(certificatePath),
  },
  async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let resolvedRequest;
    try {
      resolvedRequest = await resolvePreviewRequestPath(root, request.url);
    } catch (error) {
      if (error instanceof URIError) {
        response.writeHead(400);
        response.end("Bad Request");
      } else {
        console.error(error);
        response.writeHead(500);
        response.end("Internal Server Error");
      }
      return;
    }

    if (!resolvedRequest) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    const { path, metadata } = resolvedRequest;
    response.writeHead(200, {
      "Cache-Control": previewCacheControl(path),
      "Content-Length": metadata.size,
      "Content-Type": previewContentType(path),
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(path).pipe(response);
  },
);

// Long WebGL cases reuse this production-build server across serial projects.
server.keepAliveTimeout = 5 * 60_000;
server.headersTimeout = server.keepAliveTimeout + 5_000;

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("E2E preview did not receive a TCP address.");
  }
  console.log(`Local: https://127.0.0.1:${address.port}/`);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
