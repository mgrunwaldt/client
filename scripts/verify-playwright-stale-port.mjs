import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

let staleRequestCount = 0;
const staleServer = createServer((_request, response) => {
  staleRequestCount += 1;
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end(
    '<div id="root"><button aria-label="Connect Controller">Connect Controller</button></div>',
  );
});

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine the stale listener port");
  }
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const stalePort = await listen(staleServer);

try {
  await run(
    process.execPath,
    [fileURLToPath(new URL("./run-playwright.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        OVERGOAL_OCCUPIED_PORT: String(stalePort),
        OVERGOAL_STALE_PORT_PROOF: "1",
      },
    },
  );
  if (staleRequestCount !== 0) {
    throw new Error(
      `Browser smoke contacted the occupied listener on ${stalePort} (${staleRequestCount} requests)`,
    );
  }
} finally {
  await close(staleServer);
}

console.log(
  `Stale-port proof passed: no browser requests reached ${stalePort}`,
);
