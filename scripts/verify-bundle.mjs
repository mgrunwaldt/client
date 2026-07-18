import { readdir, readFile, stat } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("dist/.vite/manifest.json", projectRoot), "utf8"),
);
const maxChunkBytes = 500_000;
const assetDirectory = new URL("dist/assets/", projectRoot);
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
