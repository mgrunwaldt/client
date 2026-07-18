import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const usesProcessGroups = process.platform !== "win32";
const execFile = promisify(execFileCallback);
const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);

function packageManagerVersion(packageManager) {
  const version = packageManager?.match(/^pnpm@([^+]+)/u)?.[1];
  if (!version) throw new Error("package.json must pin pnpm in packageManager");
  return version;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(new Error("Timed out waiting for the browser runner to exit")),
      timeoutMs,
    );
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function sendSignal(child, signal) {
  if (usesProcessGroups) {
    process.kill(-child.pid, signal);
  } else if (!child.kill(signal)) {
    throw new Error(`Could not signal browser runner ${child.pid}`);
  }
}

function waitForOutput(child, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      finish(
        reject,
        new Error(`Timed out waiting for runner output: ${output}`),
      );
    }, timeoutMs);
    const finish = (callback, value) => {
      clearTimeout(timeout);
      child.stdout.off("data", inspect);
      child.stderr.off("data", inspect);
      child.off("error", onError);
      callback(value);
    };
    const inspect = (chunk) => {
      output += chunk.toString();
      const result = predicate(output);
      if (result) finish(resolve, result);
    };
    const onError = (error) => finish(reject, error);
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", onError);
  });
}

async function assertPortCanBeRebound(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
}

async function assertProcessGroupIsGone(processGroup) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { stdout } = await execFile("ps", [
      "-axo",
      "pid=,ppid=,pgid=,command=",
    ]);
    const members = stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/u, 4))
      .filter((columns) => Number(columns[2]) === processGroup);
    if (members.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Process group ${processGroup} survived runner termination`);
}

async function assertProcessIsGone(pid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Process ${pid} survived runner termination`);
}

function childGroupFromOutput(output, name) {
  const match = output.match(
    new RegExp(`OVERGOAL_CHILD_GROUP=${name}:(\\d+)`, "u"),
  );
  if (!match)
    throw new Error(`Runner did not report the ${name} process group`);
  return Number(match[1]);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const pnpmVersion = packageManagerVersion(packageJson.packageManager);
const packageTest = spawn("corepack", [`pnpm@${pnpmVersion}`, "test:browser"], {
  detached: usesProcessGroups,
  env: {
    ...process.env,
    OVERGOAL_RUNNER_SIGNAL_PROOF: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  const readyOutput = await waitForOutput(
    packageTest,
    (output) => (output.includes("OVERGOAL_BROWSER_READY") ? output : null),
    120_000,
  );
  const previewUrl = readyOutput.match(
    /OVERGOAL_PREVIEW_URL=(http:\/\/127\.0\.0\.1:\d+)/u,
  )?.[1];
  if (!previewUrl)
    throw new Error("Runner did not report an owned preview URL");
  const previewPort = Number(new URL(previewUrl).port);
  const runnerPid = Number(
    readyOutput.match(/OVERGOAL_RUNNER_PID=(\d+)/u)?.[1],
  );
  if (!runnerPid) throw new Error("Runner did not report its process ID");
  const groups = [
    packageTest.pid,
    childGroupFromOutput(readyOutput, "preview"),
    childGroupFromOutput(readyOutput, "playwright"),
  ];

  sendSignal(packageTest, "SIGTERM");
  const exit = await waitForExit(packageTest, 15_000);
  if (exit.code !== 143 && exit.signal !== "SIGTERM") {
    throw new Error(
      `Package script did not terminate from SIGTERM: ${exit.code ?? exit.signal}`,
    );
  }

  await assertPortCanBeRebound(previewPort);
  await Promise.all([
    assertProcessIsGone(runnerPid),
    ...[...new Set(groups)].map(assertProcessGroupIsGone),
  ]);
} finally {
  if (packageTest.exitCode === null && packageTest.signalCode === null) {
    try {
      sendSignal(packageTest, "SIGKILL");
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ESRCH")
        throw error;
    }
  }
}

console.log(
  "Signal cleanup proof passed: package script left no runner, preview, or Playwright process group/listener",
);
