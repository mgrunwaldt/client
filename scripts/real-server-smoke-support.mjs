import { spawnSync } from "node:child_process";
import {
  access,
  chmod,
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";

export const REAL_SERVER_HOST = "127.0.0.1";
export const REAL_SERVER_PORT = 3444;
export const REAL_CLIENT_PORT = 4176;
export const REAL_SERVER_ORIGIN = `https://${REAL_SERVER_HOST}:${REAL_SERVER_PORT}`;
export const REAL_CLIENT_ORIGIN = `https://${REAL_SERVER_HOST}:${REAL_CLIENT_PORT}`;
export const REAL_SMOKE_FIXTURE_COMMAND_FILE = "fixture-command.json";
export const REAL_SMOKE_FIXTURE_ACK_FILE = "fixture-ack.json";
export const REAL_SMOKE_FIXTURE_VERSION = 1;
export const REAL_SMOKE_UNKNOWN_SCENE_TYPE = "FUTURE_RANDOM_EVENT_V99";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, description) {
  if (!isRecord(value)) {
    throw new Error(`${description} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${description} contains unsupported fields.`);
  }
}

function requireIdentifier(value, description) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/u.test(value)
  ) {
    throw new Error(`${description} is invalid.`);
  }
  return value;
}

function requireRevision(value, description) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} is invalid.`);
  }
  return value;
}

/**
 * This protocol is only consumed by scripts/start-real-match-api.mjs while the
 * real-server smoke owns a private temporary state directory. It is not a
 * Match API operation and is never reachable from the browser over HTTP.
 */
export function parseRealSmokeFixtureCommand(value) {
  requireExactKeys(
    value,
    [
      "command_id",
      "expected_revision",
      "match_id",
      "operation",
      "scene_type",
      "version",
    ],
    "Real smoke fixture command",
  );
  if (value.version !== REAL_SMOKE_FIXTURE_VERSION) {
    throw new Error("Real smoke fixture command version is unsupported.");
  }
  if (value.operation !== "INJECT_UNKNOWN_SCENE") {
    throw new Error("Real smoke fixture command operation is unsupported.");
  }
  if (value.scene_type !== REAL_SMOKE_UNKNOWN_SCENE_TYPE) {
    throw new Error("Real smoke fixture command scene type is unsupported.");
  }
  return Object.freeze({
    commandId: requireIdentifier(value.command_id, "Fixture command id"),
    expectedRevision: requireRevision(
      value.expected_revision,
      "Fixture expected revision",
    ),
    matchId: requireIdentifier(value.match_id, "Fixture match id"),
    operation: value.operation,
    sceneType: value.scene_type,
  });
}

export function createRealSmokeUnknownSceneCommand({
  commandId = `fixture_${randomUUID().replaceAll("-", "")}`,
  expectedRevision,
  matchId,
}) {
  const command = parseRealSmokeFixtureCommand({
    command_id: commandId,
    expected_revision: expectedRevision,
    match_id: matchId,
    operation: "INJECT_UNKNOWN_SCENE",
    scene_type: REAL_SMOKE_UNKNOWN_SCENE_TYPE,
    version: REAL_SMOKE_FIXTURE_VERSION,
  });
  return Object.freeze({
    command_id: command.commandId,
    expected_revision: command.expectedRevision,
    match_id: command.matchId,
    operation: command.operation,
    scene_type: command.sceneType,
    version: REAL_SMOKE_FIXTURE_VERSION,
  });
}

export function parseRealSmokeFixtureAcknowledgement(value) {
  requireExactKeys(
    value,
    [
      "action_id",
      "command_id",
      "match_id",
      "revision",
      "scene_type",
      "status",
      "version",
    ],
    "Real smoke fixture acknowledgement",
  );
  if (
    value.version !== REAL_SMOKE_FIXTURE_VERSION ||
    value.status !== "APPLIED"
  ) {
    throw new Error("Real smoke fixture acknowledgement is invalid.");
  }
  if (value.scene_type !== REAL_SMOKE_UNKNOWN_SCENE_TYPE) {
    throw new Error(
      "Real smoke fixture acknowledgement scene type is invalid.",
    );
  }
  return Object.freeze({
    actionId: requireIdentifier(value.action_id, "Fixture action id"),
    commandId: requireIdentifier(value.command_id, "Fixture command id"),
    matchId: requireIdentifier(value.match_id, "Fixture match id"),
    revision: requireRevision(value.revision, "Fixture revision"),
    sceneType: value.scene_type,
  });
}

async function assertPrivateRegularTarget(pathname, description) {
  try {
    const entry = await lstat(pathname);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`${description} must be a private regular file.`);
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
}

async function writePrivateJsonAtomically(pathname, value, description) {
  await assertPrivateRegularTarget(pathname, description);
  const temporaryPath = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, pathname);
    await chmod(pathname, 0o600);
  } finally {
    // The rename removes the temporary file on success. A failed write leaves
    // no reusable command that a later smoke run could consume.
    await rm(temporaryPath, { force: true });
  }
}

export async function publishRealSmokeFixtureCommand(stateDirectory, command) {
  parseRealSmokeFixtureCommand(command);
  await writePrivateJsonAtomically(
    resolve(stateDirectory, REAL_SMOKE_FIXTURE_COMMAND_FILE),
    command,
    "Real smoke fixture command",
  );
}

export async function waitForRealSmokeFixtureAcknowledgement(
  stateDirectory,
  commandId,
  { intervalMs = 25, timeoutMs = 10_000 } = {},
) {
  requireIdentifier(commandId, "Fixture command id");
  const acknowledgementPath = resolve(
    stateDirectory,
    REAL_SMOKE_FIXTURE_ACK_FILE,
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await assertPrivateRegularTarget(
        acknowledgementPath,
        "Real smoke fixture acknowledgement",
      );
      const acknowledgement = parseRealSmokeFixtureAcknowledgement(
        JSON.parse(await readFile(acknowledgementPath, "utf8")),
      );
      if (acknowledgement.commandId === commandId) return acknowledgement;
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) {
        throw error;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  throw new Error("Timed out waiting for real smoke fixture acknowledgement.");
}

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
