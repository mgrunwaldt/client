import {
  chmod,
  lstat,
  realpath,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  REAL_SMOKE_FIXTURE_ACK_FILE,
  REAL_SMOKE_FIXTURE_COMMAND_FILE,
  REAL_SMOKE_FIXTURE_VERSION,
  parseRealSmokeFixtureCommand,
} from "./real-server-smoke-support.mjs";

const [, , serverRootArgument, stateDirectory, clientOrigin, portArgument] =
  process.argv;
if (!serverRootArgument || !stateDirectory || !clientOrigin || !portArgument) {
  throw new Error("Real Match API launcher arguments are required.");
}

const serverRoot = await realpath(resolve(serverRootArgument));
const port = Number(portArgument);
const parsedOrigin = new URL(clientOrigin);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65_535 ||
  port === 3000 ||
  parsedOrigin.protocol !== "https:" ||
  parsedOrigin.hostname !== "127.0.0.1"
) {
  throw new Error("Real Match API deployment arguments are invalid.");
}

function serverModule(relativePath) {
  return pathToFileURL(resolve(serverRoot, relativePath)).href;
}

async function assertPrivateRegularFile(pathname, description) {
  const entry = await lstat(pathname);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`${description} must be a regular file.`);
  }
}

async function writeFixtureAcknowledgement(stateDirectory, acknowledgement) {
  const pathname = resolve(stateDirectory, REAL_SMOKE_FIXTURE_ACK_FILE);
  if (existsSync(pathname)) {
    await assertPrivateRegularFile(
      pathname,
      "Real smoke fixture acknowledgement",
    );
  }
  const temporaryPath = `${pathname}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(acknowledgement)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, pathname);
    await chmod(pathname, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function injectUnknownScene(repository, command) {
  return repository.withTransaction(() => {
    const match = repository.getMatch(command.matchId);
    if (!match) throw new Error("Fixture match does not exist.");
    if (match.revision !== command.expectedRevision) {
      throw new Error("Fixture match revision does not match the command.");
    }
    if (!match.pending_action || typeof match.pending_action !== "object") {
      throw new Error("Fixture match has no persisted pending action.");
    }
    if (
      typeof match.pending_action.id !== "string" ||
      !match.pending_action.id
    ) {
      throw new Error("Fixture match pending action is invalid.");
    }

    match.pending_action = {
      ...match.pending_action,
      action_type: command.sceneType,
      description: "Unsupported future event content.",
      scene_type: command.sceneType,
      title: "Future Event",
    };
    match.next_match_action = command.sceneType;
    repository.saveMatch(match);
    return {
      action_id: match.pending_action.id,
      match_id: match.id,
      revision: match.revision,
    };
  });
}

function startFixtureCommandChannel({ repository, stateDirectory }) {
  if (process.env.OVERGOAL_REAL_SMOKE_FIXTURE_CHANNEL !== "1") {
    return () => {};
  }

  const commandPath = resolve(stateDirectory, REAL_SMOKE_FIXTURE_COMMAND_FILE);
  let processing = false;
  const processedCommandIds = new Set();
  const poll = setInterval(() => {
    if (processing || !existsSync(commandPath)) return;
    processing = true;
    void (async () => {
      try {
        await assertPrivateRegularFile(
          commandPath,
          "Real smoke fixture command",
        );
        const command = parseRealSmokeFixtureCommand(
          JSON.parse(await readFile(commandPath, "utf8")),
        );
        if (processedCommandIds.has(command.commandId)) {
          throw new Error("Real smoke fixture command was already consumed.");
        }
        const result = injectUnknownScene(repository, command);
        await writeFixtureAcknowledgement(stateDirectory, {
          action_id: result.action_id,
          command_id: command.commandId,
          match_id: result.match_id,
          revision: result.revision,
          scene_type: command.sceneType,
          status: "APPLIED",
          version: REAL_SMOKE_FIXTURE_VERSION,
        });
        processedCommandIds.add(command.commandId);
        console.log(`OVERGOAL_REAL_SMOKE_FIXTURE_APPLIED=${command.commandId}`);
      } catch (error) {
        console.error(
          `OVERGOAL_REAL_SMOKE_FIXTURE_FAILED=${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      } finally {
        await rm(commandPath, { force: true });
        processing = false;
      }
    })();
  }, 25);
  poll.unref();
  return () => clearInterval(poll);
}

const [localDemo, runtimeConfigModule, repositoryModule, serverRuntimeModule] =
  await Promise.all([
    import(serverModule("src/runtime/localDemo.js")),
    import(serverModule("src/operations/runtimeConfig.js")),
    import(serverModule("src/persistence/productionMatchRepository.js")),
    import(serverModule("src/runtime/serverRuntime.js")),
  ]);

const reserved = localDemo.reserveLocalDemoAuthSeed({ stateDirectory });
const repository = repositoryModule.createProductionMatchRepository({
  filename: reserved.paths.databasePath,
});

let runtime;
let stopFixtureChannel = () => {};
try {
  localDemo.provisionLocalDemoIdentity(repository, reserved.fixture);
  const runtimeConfig = runtimeConfigModule.parseRuntimeConfig({
    HOST: "127.0.0.1",
    PORT: String(port),
    MATCH_DB_PATH: reserved.paths.databasePath,
    TLS_CERT_PATH: reserved.paths.certificatePath,
    TLS_KEY_PATH: reserved.paths.privateKeyPath,
    ALLOWED_HOSTS: `127.0.0.1:${port}`,
    CORS_ORIGINS: parsedOrigin.origin,
    METRICS_ENABLED: "false",
  });
  const config = runtimeConfigModule.attachAuthRuntimeConfig(
    runtimeConfig,
    localDemo.createLocalDemoAuthConfig(reserved.fixture, {
      origin: parsedOrigin.origin,
      seed: reserved.seed,
    }),
  );
  runtime = serverRuntimeModule.createServerRuntime({
    config,
    repository,
  });
  stopFixtureChannel = startFixtureCommandChannel({
    repository,
    stateDirectory,
  });
  serverRuntimeModule.installSignalHandlers(runtime);
  await runtime.start();
} catch (error) {
  stopFixtureChannel();
  if (!runtime) repository.close();
  throw error;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => stopFixtureChannel());
}
