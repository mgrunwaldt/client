import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractVitePreviewUrl } from "./preview-url.mjs";
import {
  REAL_CLIENT_ORIGIN,
  REAL_CLIENT_PORT,
  REAL_SERVER_ORIGIN,
  REAL_SERVER_PORT,
  assertPortsAvailable,
  parseServerStarted,
  validateRealServerRuntime,
} from "./real-server-smoke-support.mjs";

const viteBinary = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);
const playwrightCli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const realServerLauncher = fileURLToPath(
  new URL("./start-real-match-api.mjs", import.meta.url),
);
const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
const usesProcessGroups = process.platform !== "win32";
const initialParentPid = process.ppid;
const ownedChildren = new Map();

let cleanupPromise;
let temporaryDirectory;
let parentWatchdog;
let shutdownRequested = false;
let shutdownSignal;

function spawnOwned(name, command, args, options = {}) {
  if (shutdownRequested) {
    throw new Error(
      `Cannot start ${name} while smoke runner is shutting down.`,
    );
  }
  const child = spawn(command, args, {
    detached: usesProcessGroups,
    ...options,
  });
  ownedChildren.set(child, name);
  child.once("close", () => ownedChildren.delete(child));
  console.log(`OVERGOAL_REAL_SMOKE_CHILD=${name}:${child.pid}`);
  return child;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit) => {
    const timeout = setTimeout(() => finish(null), timeoutMs);
    const finish = (result) => {
      clearTimeout(timeout);
      child.off("close", onClose);
      child.off("error", onError);
      resolveExit(result);
    };
    const onClose = (code, signal) => finish({ code, signal });
    const onError = () => finish(null);
    child.once("close", onClose);
    child.once("error", onError);
  });
}

function signalOwnedChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (usesProcessGroups) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return;
    throw error;
  }
}

async function stopOwnedChild(child, name) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalOwnedChild(child, "SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  signalOwnedChild(child, "SIGKILL");
  if (await waitForExit(child, 5_000)) return;
  throw new Error(`${name} process group ignored SIGTERM and SIGKILL.`);
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  shutdownRequested = true;
  cleanupPromise = (async () => {
    if (parentWatchdog) clearInterval(parentWatchdog);
    const failures = [];
    for (const [child, name] of [...ownedChildren.entries()].reverse()) {
      try {
        await stopOwnedChild(child, name);
      } catch (error) {
        failures.push(error);
      }
    }
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Could not stop smoke-owned processes.",
      );
    }
  })();
  return cleanupPromise;
}

function runOwned(name, command, args, options = {}) {
  const child = spawnOwned(name, command, args, {
    stdio: "inherit",
    ...options,
  });
  return new Promise((resolveRun, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${name} exited with ${code ?? signal}.`));
    });
  });
}

function waitForOutput(child, { description, inspect, timeoutMs = 30_000 }) {
  return new Promise((resolveOutput, reject) => {
    let settled = false;
    let output = "";
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("close", onClose);
      callback(value);
    };
    const timeout = setTimeout(
      () => finish(reject, new Error(`Timed out waiting for ${description}.`)),
      timeoutMs,
    );
    const onData = (chunk) => {
      output = `${output}${chunk}`.slice(-16_384);
      try {
        const result = inspect(output);
        if (result) finish(resolveOutput, result);
      } catch (error) {
        finish(reject, error);
      }
    };
    const onError = (error) => finish(reject, error);
    const onClose = (code, signal) =>
      finish(
        reject,
        new Error(`${description} process exited with ${code ?? signal}.`),
      );
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

function waitForServer(server) {
  return waitForOutput(server, {
    description: "real Match API startup",
    inspect(output) {
      for (const line of output.split("\n")) {
        const started = parseServerStarted(line);
        if (started) return started;
      }
      return null;
    },
  });
}

function waitForPreview(preview) {
  return waitForOutput(preview, {
    description: "production preview startup",
    inspect: extractVitePreviewUrl,
  });
}

function waitForBrowserOrServiceExit(browser, services) {
  return new Promise((resolveBrowser, reject) => {
    let settled = false;
    const listeners = [];
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      for (const [target, event, listener] of listeners) {
        target.off(event, listener);
      }
      callback(value);
    };
    const watch = (target, event, listener) => {
      listeners.push([target, event, listener]);
      target.once(event, listener);
    };
    watch(browser, "error", (error) => finish(reject, error));
    watch(browser, "close", (code, signal) => {
      if (code === 0) finish(resolveBrowser);
      else
        finish(reject, new Error(`Playwright exited with ${code ?? signal}.`));
    });
    for (const [service, name] of services) {
      watch(service, "error", (error) => finish(reject, error));
      watch(service, "close", (code, signal) =>
        finish(
          reject,
          new Error(`${name} stopped unexpectedly with ${code ?? signal}.`),
        ),
      );
    }
  });
}

async function createCertificate(stateDirectory) {
  const keyPath = join(stateDirectory, "localhost-key.pem");
  const certificatePath = join(stateDirectory, "localhost.pem");
  await runOwned(
    "https-certificate",
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  await Promise.all([chmod(keyPath, 0o600), chmod(certificatePath, 0o600)]);
  return { certificatePath, keyPath };
}

async function main() {
  await assertPortsAvailable();
  const serverRuntime = await validateRealServerRuntime({
    serverRoot: process.env.OVERGOAL_REAL_SERVER_ROOT,
    serverNode: process.env.OVERGOAL_REAL_SERVER_NODE,
  });
  console.log(
    `OVERGOAL_REAL_SERVER_RUNTIME=${serverRuntime.root}:node-${serverRuntime.expectedNode}`,
  );

  temporaryDirectory = await mkdtemp(join(tmpdir(), "overgoal-real-smoke-"));
  const stateDirectory = join(temporaryDirectory, "state");
  const distDirectory = join(temporaryDirectory, "dist");
  await mkdir(stateDirectory, { mode: 0o700 });
  const certificate = await createCertificate(stateDirectory);

  const server = spawnOwned(
    "real-match-api",
    process.env.OVERGOAL_REAL_SERVER_NODE,
    [
      realServerLauncher,
      serverRuntime.root,
      stateDirectory,
      REAL_CLIENT_ORIGIN,
      String(REAL_SERVER_PORT),
    ],
    {
      cwd: serverRuntime.root,
      env: {
        ...process.env,
        LOCAL_DEMO_STATE_DIR: stateDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);
  await waitForServer(server);

  const fixture = JSON.parse(
    await readFile(join(stateDirectory, "fixture.json"), "utf8"),
  );
  if (!Array.isArray(fixture.wallets) || fixture.wallets.length !== 2) {
    throw new Error(
      "Real LOCAL_CI runtime did not provision its wallet fixture.",
    );
  }
  const encodedWallets = JSON.stringify(fixture.wallets);
  const buildEnvironment = {
    ...process.env,
    VITE_E2E_LOCAL_CI_WALLETS: encodedWallets,
    VITE_MATCH_API_BASE_URL: REAL_SERVER_ORIGIN,
  };

  await runOwned(
    "real-server-production-build",
    process.execPath,
    [
      viteBinary,
      "build",
      "--mode",
      "production",
      "--outDir",
      distDirectory,
      "--emptyOutDir",
    ],
    { env: buildEnvironment },
  );
  await runOwned("real-server-bundle-verify", process.execPath, [
    "scripts/verify-bundle.mjs",
    distDirectory,
  ]);

  const preview = spawnOwned(
    "real-server-preview",
    process.execPath,
    [
      viteBinary,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(REAL_CLIENT_PORT),
      "--strictPort",
      "--outDir",
      distDirectory,
    ],
    {
      env: {
        ...process.env,
        VITE_LOCAL_HTTPS: "true",
        VITE_HTTPS_KEY_PATH: certificate.keyPath,
        VITE_HTTPS_CERT_PATH: certificate.certificatePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  preview.stdout.pipe(process.stdout);
  preview.stderr.pipe(process.stderr);
  const previewUrl = await waitForPreview(preview);
  if (new URL(previewUrl).origin !== REAL_CLIENT_ORIGIN) {
    throw new Error(`Production preview used unexpected origin ${previewUrl}.`);
  }
  console.log(`OVERGOAL_REAL_SMOKE_PREVIEW_URL=${previewUrl}`);

  const browser = spawnOwned(
    "real-server-playwright",
    process.execPath,
    [playwrightCli, "test", "e2e/real-server.spec.ts"],
    {
      env: {
        ...process.env,
        OVERGOAL_MATCH_API_BASE_URL: REAL_SERVER_ORIGIN,
        OVERGOAL_REAL_SERVER_SMOKE: "1",
        PLAYWRIGHT_BASE_URL: previewUrl,
      },
      stdio: "inherit",
    },
  );
  await waitForBrowserOrServiceExit(browser, [
    [preview, "production preview"],
    [server, "real Match API"],
  ]);
}

function signalExitCode(signal) {
  return { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[signal] ?? 1;
}

function requestShutdown(signal, reason) {
  if (shutdownSignal) return;
  shutdownSignal = signal;
  if (reason) console.error(reason);
  void cleanup()
    .catch((error) => console.error(error))
    .finally(() => process.exit(signalExitCode(signal)));
}

for (const signal of shutdownSignals) {
  process.on(signal, () => requestShutdown(signal));
}

if (usesProcessGroups && initialParentPid > 1) {
  parentWatchdog = setInterval(() => {
    if (process.ppid !== initialParentPid) {
      requestShutdown(
        "SIGHUP",
        "Smoke runner parent disappeared; cleaning up owned processes.",
      );
    }
  }, 100);
  parentWatchdog.unref();
}

try {
  console.log(`OVERGOAL_REAL_SMOKE_RUNNER_PID=${process.pid}`);
  await main();
} finally {
  await cleanup();
}
