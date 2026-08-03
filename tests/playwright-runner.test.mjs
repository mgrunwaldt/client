import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  collectPlaywrightCases,
  isolatedPlaywrightArgs,
  runIsolatedPlaywrightCases,
} from "../scripts/playwright-isolation.mjs";

const runnerUrl = new URL("../scripts/run-playwright.mjs", import.meta.url);

describe("Playwright runner process ownership", () => {
  it("launches installed CLIs directly instead of resolving them through Corepack", async () => {
    const source = await readFile(runnerUrl, "utf8");

    expect(source).toContain(
      'new URL("../node_modules/playwright/cli.js", import.meta.url)',
    );
    expect(source).toContain('"playwright-list"');
    expect(source).toContain("isolatedPlaywrightArgs(");
    expect(source).not.toContain(
      'spawnOwned("playwright", "corepack", playwrightArgs',
    );
    expect(source).not.toContain('runOwned("corepack-enable"');
  });

  it("runs every discovered project case in its own Playwright process", async () => {
    const report = {
      suites: [
        {
          specs: [
            {
              file: "tactical-kick.spec.ts",
              line: 10,
              title: "renders OPEN_PLAY (mobile)",
              tests: [
                { projectName: "chromium" },
                { projectName: "mobile-chromium" },
              ],
            },
            {
              file: "tactical-kick.spec.ts",
              line: 10,
              title: "renders FREE_KICK",
              tests: [{ projectName: "chromium" }],
            },
          ],
          suites: [],
        },
      ],
    };
    const cases = collectPlaywrightCases(report);
    const visited = [];
    let activeCases = 0;
    let maximumActiveCases = 0;
    const failures = await runIsolatedPlaywrightCases(
      cases,
      async (entry, index) => {
        activeCases += 1;
        maximumActiveCases = Math.max(maximumActiveCases, activeCases);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          visited.push(`${entry.projectName}:${entry.title}`);
          if (index === 0) throw new Error("synthetic browser failure");
        } finally {
          activeCases -= 1;
        }
      },
    );

    expect(visited).toEqual([
      "chromium:renders OPEN_PLAY (mobile)",
      "mobile-chromium:renders OPEN_PLAY (mobile)",
      "chromium:renders FREE_KICK",
    ]);
    expect(maximumActiveCases).toBe(1);
    expect(activeCases).toBe(0);
    expect(failures).toHaveLength(1);
    expect(isolatedPlaywrightArgs("playwright.js", cases[1], 1)).toEqual([
      "playwright.js",
      "test",
      "e2e/tactical-kick.spec.ts:10",
      "--project=mobile-chromium",
      "--grep",
      "renders OPEN_PLAY \\(mobile\\)$",
      "--output=test-results/isolated/002-mobile-chromium",
    ]);
  });

  it("rejects an empty or duplicate Playwright inventory", () => {
    expect(() => collectPlaywrightCases({ suites: [] })).toThrow(
      "inventory is empty",
    );
    const duplicate = {
      suites: [
        {
          specs: [
            {
              file: "duplicate.spec.ts",
              line: 7,
              title: "same test",
              tests: [{ projectName: "chromium" }, { projectName: "chromium" }],
            },
          ],
        },
      ],
    };
    expect(() => collectPlaywrightCases(duplicate)).toThrow(
      "inventory repeated",
    );
  });
});
