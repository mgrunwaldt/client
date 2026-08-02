import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  serverRuntimeModule.installSignalHandlers(runtime);
  await runtime.start();
} catch (error) {
  if (!runtime) repository.close();
  throw error;
}
