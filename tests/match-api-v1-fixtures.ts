import { readFile } from "node:fs/promises";

const fixtureRoot = new URL("./fixtures/match-api-v1/", import.meta.url);

export function fixtureUrl(path: string) {
  return new URL(path, fixtureRoot);
}

export async function readFixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(fixtureUrl(path), "utf8")) as T;
}
