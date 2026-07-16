import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractVitePreviewUrl } from "./preview-url.mjs";

const viteBinary = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);
const pnpmVersion =
  process.env.npm_config_user_agent?.match(/^pnpm\/([^\s]+)/u)?.[1];
const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
const usesProcessGroups = process.platform !== "win32";
const initialParentPid = process.ppid;

if (!pnpmVersion) {
  throw new Error("pnpm is required to run browser tests");
}

const ownedChildren = new Map();
let cleanupPromise;
let pnpmShimDirectory;
let parentWatchdog;
let shutdownRequested = false;
let shutdownSignal;

function occupiedPort() {
  const value = process.env.OVERGOAL_OCCUPIED_PORT;
  if (!value) return null;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("OVERGOAL_OCCUPIED_PORT must be a valid TCP port");
  }
  return port;
}

function spawnOwned(name, command, args, options = {}) {
  if (shutdownRequested) {
    throw new Error(
      `Cannot start ${name} while browser runner is shutting down`,
    );
  }

  const child = spawn(command, args, {
    detached: usesProcessGroups,
    ...options,
  });
  ownedChildren.set(child, name);
  child.once("close", () => ownedChildren.delete(child));
  console.log(`OVERGOAL_CHILD_GROUP=${name}:${child.pid}`);
  return child;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(null), timeoutMs);
    const finish = (result) => {
      clearTimeout(timeout);
      child.off("close", onClose);
      child.off("error", onError);
      resolve(result);
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
    if (usesProcessGroups) {
      process.kill(-child.pid, signal);
    } else if (!child.kill(signal)) {
      throw new Error(`could not signal child ${child.pid}`);
    }
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

  throw new Error(`${name} process group ignored SIGTERM and SIGKILL`);
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;

  shutdownRequested = true;
  cleanupPromise = (async () => {
    if (parentWatchdog) clearInterval(parentWatchdog);

    const failures = [];
    const children = [...ownedChildren.entries()].reverse();
    for (const [child, name] of children) {
      try {
        await stopOwnedChild(child, name);
      } catch (error) {
        failures.push(error);
      }
    }

    if (pnpmShimDirectory) {
      await rm(pnpmShimDirectory, { force: true, recursive: true });
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Could not stop owned browser children",
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
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}`));
    });
  });
}

function runPnpm(name, args, options = {}) {
  return runOwned(name, "corepack", [`pnpm@${pnpmVersion}`, ...args], {
    ...options,
    env: {
      ...process.env,
      ...options.env,
      PATH: `${pnpmShimDirectory}${delimiter}${options.env?.PATH ?? process.env.PATH}`,
    },
  });
}

async function createPnpmShimDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "overgoal-pnpm-"));
  if (shutdownRequested) {
    await rm(directory, { force: true, recursive: true });
    throw new Error("Browser runner shut down before Corepack setup completed");
  }

  pnpmShimDirectory = directory;
  await runOwned("corepack-enable", "corepack", [
    "enable",
    "--install-directory",
    pnpmShimDirectory,
  ]);
  return pnpmShimDirectory;
}

function waitForPreviewUrl(preview) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let output = "";
    const timeout = setTimeout(() => {
      finish(reject, new Error("Timed out waiting for Vite preview URL"));
    }, 30_000);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      preview.stdout.off("data", inspect);
      preview.off("error", onError);
      preview.off("close", onClose);
      callback(value);
    };
    const inspect = (chunk) => {
      output = `${output}${chunk}`.slice(-4_096);
      const url = extractVitePreviewUrl(output);
      if (url) finish(resolve, url);
    };
    const onError = (error) => finish(reject, error);
    const onClose = (code, signal) =>
      finish(
        reject,
        new Error(`Vite preview exited before startup with ${code ?? signal}`),
      );

    preview.stdout.on("data", inspect);
    preview.once("error", onError);
    preview.once("close", onClose);
  });
}

function waitForBrowserOrPreviewExit(browser, preview) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      browser.off("error", onBrowserError);
      browser.off("close", onBrowserClose);
      preview.off("error", onPreviewError);
      preview.off("close", onPreviewClose);
      callback(value);
    };
    const onBrowserError = (error) => finish(reject, error);
    const onBrowserClose = (code, signal) => {
      if (code === 0) finish(resolve);
      else
        finish(reject, new Error(`Playwright exited with ${code ?? signal}`));
    };
    const onPreviewError = (error) => finish(reject, error);
    const onPreviewClose = (code, signal) =>
      finish(
        reject,
        new Error(`Vite preview stopped unexpectedly with ${code ?? signal}`),
      );

    browser.once("error", onBrowserError);
    browser.once("close", onBrowserClose);
    preview.once("error", onPreviewError);
    preview.once("close", onPreviewClose);
  });
}

async function main() {
  await createPnpmShimDirectory();
  await runPnpm("build", ["build"]);

  const preview = spawnOwned(
    "preview",
    process.execPath,
    [
      viteBinary,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--strictPort",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  preview.stdout.pipe(process.stdout);
  preview.stderr.pipe(process.stderr);

  const baseUrl = await waitForPreviewUrl(preview);
  const previewPort = Number(new URL(baseUrl).port);
  const forbiddenPort = occupiedPort();
  if (
    !previewPort ||
    (forbiddenPort !== null && previewPort === forbiddenPort)
  ) {
    throw new Error("Vite preview did not receive its own OS-assigned port");
  }
  console.log(`OVERGOAL_PREVIEW_URL=${baseUrl}`);

  const playwrightArgs = [`pnpm@${pnpmVersion}`, "exec", "playwright", "test"];
  if (process.env.OVERGOAL_RUNNER_SIGNAL_PROOF === "1") {
    playwrightArgs.push(
      "--project=chromium",
      "--grep",
      "holds an active browser worker for the runner signal-cleanup proof",
    );
  }
  const browser = spawnOwned("playwright", "corepack", playwrightArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: `${pnpmShimDirectory}${delimiter}${process.env.PATH}`,
      PLAYWRIGHT_BASE_URL: baseUrl,
    },
  });
  await waitForBrowserOrPreviewExit(browser, preview);
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
  // Package managers can forward the original signal after the process group gets it.
  process.on(signal, () => requestShutdown(signal));
}

if (usesProcessGroups && initialParentPid > 1) {
  parentWatchdog = setInterval(() => {
    if (process.ppid !== initialParentPid) {
      requestShutdown(
        "SIGHUP",
        "Browser runner parent disappeared; cleaning up owned children",
      );
    }
  }, 100);
  parentWatchdog.unref();
}

try {
  console.log(`OVERGOAL_RUNNER_PID=${process.pid}`);
  await main();
} finally {
  await cleanup();
}
