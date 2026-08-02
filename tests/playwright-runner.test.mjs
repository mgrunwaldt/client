import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const runnerUrl = new URL("../scripts/run-playwright.mjs", import.meta.url);

describe("Playwright runner process ownership", () => {
  it("launches installed CLIs directly instead of resolving them through Corepack", async () => {
    const source = await readFile(runnerUrl, "utf8");

    expect(source).toContain(
      'new URL("../node_modules/playwright/cli.js", import.meta.url)',
    );
    expect(source).toContain(
      'spawnOwned("playwright", process.execPath, playwrightArgs',
    );
    expect(source).not.toContain(
      'spawnOwned("playwright", "corepack", playwrightArgs',
    );
    expect(source).not.toContain('runOwned("corepack-enable"');
  });
});
