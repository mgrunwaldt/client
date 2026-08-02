import { spawnSync } from "node:child_process";
import { access, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

export const REAL_SERVER_HOST = "127.0.0.1";
export const REAL_SERVER_PORT = 3444;
export const REAL_CLIENT_PORT = 4176;
export const REAL_SERVER_ORIGIN = `https://${REAL_SERVER_HOST}:${REAL_SERVER_PORT}`;
export const REAL_CLIENT_ORIGIN = `https://${REAL_SERVER_HOST}:${REAL_CLIENT_PORT}`;

function probePort(port, host = REAL_SERVER_HOST) {
  return new Promise((resolveProbe, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(port, host, () => {
      probe.close((error) => (error ? reject(error) : resolveProbe()));
    });
  });
}

export async function assertPortsAvailable(
  ports = [REAL_CLIENT_PORT, REAL_SERVER_PORT],
  host = REAL_SERVER_HOST,
) {
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535 || port === 3000) {
      throw new Error(`Real-server smoke received an invalid port: ${port}`);
    }
    try {
      await probePort(port, host);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EADDRINUSE") {
        throw new Error(
          `Required real-server smoke port ${host}:${port} is occupied; refusing to kill or reuse an unowned listener.`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

export function parseServerStarted(line) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  if (record?.event !== "server_started") return null;
  if (
    record.host !== REAL_SERVER_HOST ||
    record.port !== REAL_SERVER_PORT ||
    record.protocol !== "https"
  ) {
    throw new Error(
      "Real Match API started with unexpected host, port, or protocol.",
    );
  }
  return record;
}

function requireExactNode(serverNode, expectedVersion) {
  const result = spawnSync(serverNode, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.error) {
    throw new Error(`Unable to execute Match API Node runtime: ${serverNode}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0 || result.stdout.trim() !== `v${expectedVersion}`) {
    throw new Error(
      `Match API requires Node v${expectedVersion}; ${serverNode} reported ${result.stdout.trim() || `exit ${result.status}`}.`,
    );
  }
}

export async function validateRealServerRuntime({ serverRoot, serverNode }) {
  if (!serverRoot) {
    throw new Error("OVERGOAL_REAL_SERVER_ROOT is required.");
  }
  if (!serverNode) {
    throw new Error("OVERGOAL_REAL_SERVER_NODE is required.");
  }

  const root = await realpath(resolve(serverRoot));
  const packagePath = resolve(root, "package.json");
  const launcherPath = resolve(root, "scripts/start-local-demo-server.mjs");
  const runtimePath = resolve(root, "src/runtime/localDemo.js");
  await Promise.all([access(launcherPath), access(runtimePath)]);

  const [packageText, launcherSource, runtimeSource] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(launcherPath, "utf8"),
    readFile(runtimePath, "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  const expectedNode = packageJson.engines?.node;
  if (
    packageJson.name !== "match-server" ||
    packageJson.scripts?.["start:local-demo"] !==
      "node scripts/start-local-demo.mjs" ||
    typeof expectedNode !== "string" ||
    !/^\d+\.\d+\.\d+$/u.test(expectedNode)
  ) {
    throw new Error(
      "OVERGOAL_REAL_SERVER_ROOT is not a supported Match API checkout.",
    );
  }
  for (const marker of [
    "createProductionMatchRepository",
    "provisionLocalDemoIdentity",
    "createServerRuntime",
    "environment: 'LOCAL_CI'",
  ]) {
    if (!runtimeSource.includes(marker)) {
      throw new Error(
        `Match API LOCAL_CI runtime is missing required marker: ${marker}`,
      );
    }
  }
  if (!launcherSource.includes("startLocalDemoServer")) {
    throw new Error("Match API launcher does not use startLocalDemoServer.");
  }
  requireExactNode(serverNode, expectedNode);

  return { root, expectedNode };
}
