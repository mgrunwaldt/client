import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const outputDirectory = process.argv[2] || "dist";
const allowsBrowserTestBridge = process.argv.includes(
  "--allow-browser-test-bridge",
);
const outputRoot = pathToFileURL(
  `${resolve(fileURLToPath(projectRoot), outputDirectory)}${sep}`,
);
const manifest = JSON.parse(
  await readFile(new URL(".vite/manifest.json", outputRoot), "utf8"),
);
const maxChunkBytes = 500_000;
const assetDirectory = new URL("assets/", outputRoot);
const javaScriptFiles = (await readdir(assetDirectory)).filter((file) =>
  file.endsWith(".js"),
);
const chunkSizes = await Promise.all(
  javaScriptFiles.map(async (file) => ({
    file,
    bytes: (await stat(new URL(file, assetDirectory))).size,
  })),
);
const oversizedChunks = chunkSizes.filter(({ bytes }) => bytes > maxChunkBytes);

if (oversizedChunks.length > 0) {
  throw new Error(
    `JavaScript chunks exceed ${maxChunkBytes} bytes: ${oversizedChunks
      .map(({ file, bytes }) => `${file} (${bytes})`)
      .join(", ")}`,
  );
}

if (!allowsBrowserTestBridge) {
  const browserTestMarkers = [
    "__OVERGOAL_E2E_SET_MATCH_RESPONSE__",
    "__OVERGOAL_E2E_SWITCH_LOCAL_CI_WALLET__",
    "__OVERGOAL_E2E_DRIBBLE_ADVANCE__",
  ];
  const bridgeChunks = (
    await Promise.all(
      javaScriptFiles.map(async (file) => {
        const source = await readFile(new URL(file, assetDirectory), "utf8");
        return {
          file,
          containsBridge: browserTestMarkers.some((marker) =>
            source.includes(marker),
          ),
        };
      }),
    )
  ).filter(({ containsBridge }) => containsBridge);

  if (bridgeChunks.length > 0) {
    throw new Error(
      `Production bundle contains the browser-test bridge: ${bridgeChunks
        .map(({ file }) => file)
        .join(", ")}`,
    );
  }
}

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
const loginKey = "src/app/(login)/Login/LoginScreen.tsx";
const gameKey = "src/app/(game)/GameScene.tsx";

if (
  !entryKey ||
  !manifest[loginKey]?.isDynamicEntry ||
  !manifest[gameKey]?.isDynamicEntry
) {
  throw new Error(
    "Expected entry, login, and game route chunks were not emitted",
  );
}

function staticClosure(startKeys) {
  const pending = [...startKeys];
  const visited = new Set();

  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    visited.add(key);
    pending.push(...(manifest[key]?.imports ?? []));
  }

  return visited;
}

const loginGraph = staticClosure([entryKey, loginKey]);
if (loginGraph.has(gameKey)) {
  throw new Error("The login static chunk graph includes the game route");
}

const maxChunk = chunkSizes.sort((left, right) => right.bytes - left.bytes)[0];
console.log(
  `Bundle verified: ${chunkSizes.length} JS chunks, largest ${maxChunk.file} (${maxChunk.bytes} bytes), game route excluded from login graph`,
);
