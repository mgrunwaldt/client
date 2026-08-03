import { readFile } from "node:fs/promises";

const fixtureRoot = new URL("./fixtures/match-api-v1/", import.meta.url);

export function fixtureUrl(path: string) {
  // Consumer tests retain concise paths while source fixtures stay an exact
  // mirror of the versioned backend layout.
  const canonicalPath = path
    .replace(/^scenes\//, "examples/scenes/")
    .replace(/^server\//, "fixtures/server/")
    .replace(/^player-client\//, "fixtures/player-client/")
    .replace(/^invalid\//, "fixtures/invalid/")
    .replace(/^manifest\.json$/, "fixtures/manifest.json");
  return new URL(canonicalPath, fixtureRoot);
}

export async function readFixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(fixtureUrl(path), "utf8")) as T;
}
