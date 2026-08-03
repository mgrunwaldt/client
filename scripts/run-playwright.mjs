import { spawn } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ec } from "starknet";
import {
  collectPlaywrightCases,
  isolatedPlaywrightArgs,
  runIsolatedPlaywrightCases,
} from "./playwright-isolation.mjs";
import { extractVitePreviewUrl } from "./preview-url.mjs";

const previewServerScript = fileURLToPath(
  new URL("./serve-e2e-preview.mjs", import.meta.url),
);
const playwrightCli = fileURLToPath(
  new URL("../node_modules/playwright/cli.js", import.meta.url),
);
const pnpmVersion =
  process.env.npm_config_user_agent?.match(/^pnpm\/([^\s]+)/u)?.[1];
const pnpmCli = process.env.npm_execpath;
const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
const usesProcessGroups = process.platform !== "win32";
const initialParentPid = process.ppid;

if (!pnpmVersion || !pnpmCli) {
  throw new Error("pnpm is required to run browser tests");
}

const ownedChildren = new Map();
let cleanupPromise;
let browserDistDirectory;
let directBrowserDistDirectory;
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

    if (browserDistDirectory) {
      await rm(browserDistDirectory, { force: true, recursive: true });
    }
    if (directBrowserDistDirectory) {
      await rm(directBrowserDistDirectory, { force: true, recursive: true });
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

function runOwnedCapture(name, command, args, options = {}) {
  const child = spawnOwned(name, command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `${name} exited with ${code ?? signal}${stderr ? `\n${stderr}` : ""}`,
          ),
        );
      }
    });
  });
}

function runPnpm(name, args, options = {}) {
  return runOwned(name, process.execPath, [pnpmCli, ...args], {
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

async function createRunnerDirectories() {
  browserDistDirectory = await mkdtemp(
    join(tmpdir(), "overgoal-browser-dist-"),
  );
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

function waitForApiUrl(server) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let output = "";
    const timeout = setTimeout(
      () => finish(reject, new Error("Timed out waiting for direct API URL")),
      30_000,
    );
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.stdout.off("data", inspect);
      server.off("error", onError);
      server.off("close", onClose);
      callback(value);
    };
    const inspect = (chunk) => {
      output = `${output}${chunk}`.slice(-4_096);
      const match = output.match(/OVERGOAL_E2E_API_URL=(https:\/\/[^\s]+)/u);
      if (match?.[1]) finish(resolve, match[1]);
    };
    const onError = (error) => finish(reject, error);
    const onClose = (code, signal) =>
      finish(
        reject,
        new Error(`Direct API exited before startup with ${code ?? signal}`),
      );

    server.stdout.on("data", inspect);
    server.once("error", onError);
    server.once("close", onClose);
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
  const localCiWallets = Array.from({ length: 2 }, () => {
    const privateKey = `0x${Buffer.from(
      ec.starkCurve.utils.randomPrivateKey(),
    ).toString("hex")}`;
    return {
      address: ec.starkCurve.getStarkKey(privateKey),
      privateKey,
      publicKey: `0x${Buffer.from(
        ec.starkCurve.getPublicKey(privateKey),
      ).toString("hex")}`,
    };
  });
  const encodedLocalCiWallets = JSON.stringify(localCiWallets);
  await createRunnerDirectories();
  await runPnpm("typecheck", ["typecheck"]);
  await runPnpm(
    "build",
    [
      "exec",
      "vite",
      "build",
      "--outDir",
      browserDistDirectory,
      "--emptyOutDir",
    ],
    {
      env: {
        VITE_E2E_LOCAL_CI_WALLETS: encodedLocalCiWallets,
        VITE_E2E_MATCH_SESSION_BRIDGE: "true",
      },
    },
  );
  await runPnpm("bundle-verify", [
    "exec",
    "node",
    "scripts/verify-bundle.mjs",
    browserDistDirectory,
    "--allow-browser-test-bridge",
  ]);

  const httpsKeyPath = join(browserDistDirectory, "preview-key.pem");
  const httpsCertPath = join(browserDistDirectory, "preview-cert.pem");
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
      httpsKeyPath,
      "-out",
      httpsCertPath,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  const certificate = new X509Certificate(await readFile(httpsCertPath));
  const certificateSpki = createHash("sha256")
    .update(certificate.publicKey.export({ format: "der", type: "spki" }))
    .digest("base64");

  const preview = spawnOwned(
    "preview",
    process.execPath,
    [previewServerScript, browserDistDirectory, httpsKeyPath, httpsCertPath],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
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

  const playwrightArgs = [playwrightCli, "test"];
  const focusedGrep = process.env.OVERGOAL_PLAYWRIGHT_GREP;
  if (focusedGrep) {
    playwrightArgs.push("--grep", focusedGrep);
  } else if (process.env.OVERGOAL_RUNNER_SIGNAL_PROOF === "1") {
    playwrightArgs.push(
      "--project=chromium",
      "--grep",
      "holds an active browser worker for the runner signal-cleanup proof",
    );
  } else if (process.env.OVERGOAL_STALE_PORT_PROOF === "1") {
    playwrightArgs.push(
      "--project=chromium",
      "--grep",
      "mounts the login route without a fatal page error",
    );
  }
  const updateSnapshots = process.env.OVERGOAL_UPDATE_SNAPSHOTS === "true";
  const browserEnvironment = {
    ...process.env,
    OVERGOAL_LOCAL_CI_WALLETS: encodedLocalCiWallets,
    OVERGOAL_E2E_CERTIFICATE_SPKI: certificateSpki,
    PLAYWRIGHT_BASE_URL: baseUrl,
  };
  const isFocusedRun =
    Boolean(focusedGrep) ||
    process.env.OVERGOAL_RUNNER_SIGNAL_PROOF === "1" ||
    process.env.OVERGOAL_STALE_PORT_PROOF === "1";

  if (isFocusedRun) {
    if (updateSnapshots) playwrightArgs.push("--update-snapshots");
    const browser = spawnOwned("playwright", process.execPath, playwrightArgs, {
      stdio: "inherit",
      env: browserEnvironment,
    });
    await waitForBrowserOrPreviewExit(browser, preview);
  } else {
    const inventory = await runOwnedCapture(
      "playwright-list",
      process.execPath,
      [playwrightCli, "test", "--list", "--reporter=json"],
      { env: browserEnvironment },
    );
    const cases = collectPlaywrightCases(JSON.parse(inventory.stdout));
    console.log(`OVERGOAL_PLAYWRIGHT_ISOLATED_TOTAL=${cases.length}`);
    const failures = await runIsolatedPlaywrightCases(
      cases,
      async (entry, index) => {
        const ordinal = String(index + 1).padStart(3, "0");
        console.log(
          `OVERGOAL_PLAYWRIGHT_CASE=${ordinal}/${cases.length}:${entry.projectName}:${entry.file}:${entry.line}:${entry.title}`,
        );
        const browser = spawnOwned(
          `playwright-${ordinal}`,
          process.execPath,
          isolatedPlaywrightArgs(playwrightCli, entry, index, updateSnapshots),
          { stdio: "inherit", env: browserEnvironment },
        );
        await waitForBrowserOrPreviewExit(browser, preview);
      },
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(
          ({ entry, error }) =>
            new Error(
              `${entry.projectName} ${entry.file}:${entry.line} ${entry.title}`,
              { cause: error },
            ),
        ),
        `${failures.length} isolated Playwright case(s) failed`,
      );
    }
  }

  await stopOwnedChild(preview, "preview");
  if (
    process.env.OVERGOAL_STALE_PORT_PROOF === "1" ||
    process.env.OVERGOAL_SKIP_DIRECT_API === "true"
  ) {
    return;
  }

  directBrowserDistDirectory = await mkdtemp(
    join(tmpdir(), "overgoal-direct-browser-dist-"),
  );
  const directApi = spawnOwned(
    "direct-api",
    process.execPath,
    ["scripts/e2e-match-api-server.mjs", httpsKeyPath, httpsCertPath],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  directApi.stdout.pipe(process.stdout);
  directApi.stderr.pipe(process.stderr);
  const directApiOrigin = await waitForApiUrl(directApi);
  const directApiBaseUrl = `${directApiOrigin}/api`;

  await runPnpm(
    "direct-build",
    [
      "exec",
      "vite",
      "build",
      "--outDir",
      directBrowserDistDirectory,
      "--emptyOutDir",
    ],
    {
      env: {
        VITE_E2E_LOCAL_CI_WALLETS: encodedLocalCiWallets,
        VITE_E2E_MATCH_SESSION_BRIDGE: "true",
        VITE_MATCH_API_BASE_URL: directApiBaseUrl,
      },
    },
  );
  await runPnpm("direct-bundle-verify", [
    "exec",
    "node",
    "scripts/verify-bundle.mjs",
    directBrowserDistDirectory,
    "--allow-browser-test-bridge",
  ]);

  const directPreview = spawnOwned(
    "direct-preview",
    process.execPath,
    [
      previewServerScript,
      directBrowserDistDirectory,
      httpsKeyPath,
      httpsCertPath,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    },
  );
  directPreview.stdout.pipe(process.stdout);
  directPreview.stderr.pipe(process.stderr);
  const directPreviewUrl = await waitForPreviewUrl(directPreview);
  console.log(`OVERGOAL_DIRECT_PREVIEW_URL=${directPreviewUrl}`);

  const directBrowser = spawnOwned(
    "direct-playwright",
    process.execPath,
    [playwrightCli, "test", "e2e/direct-api.spec.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        OVERGOAL_LOCAL_CI_WALLETS: encodedLocalCiWallets,
        OVERGOAL_E2E_CERTIFICATE_SPKI: certificateSpki,
        OVERGOAL_MATCH_API_BASE_URL: directApiBaseUrl,
        PLAYWRIGHT_BASE_URL: directPreviewUrl,
      },
    },
  );
  await waitForBrowserOrPreviewExit(directBrowser, directPreview);
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

if (
  usesProcessGroups &&
  initialParentPid > 1 &&
  process.env.OVERGOAL_DISABLE_PARENT_WATCHDOG !== "true"
) {
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
