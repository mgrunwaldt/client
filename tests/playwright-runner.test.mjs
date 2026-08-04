import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  batchedPlaywrightArgs,
  collectPlaywrightCases,
  groupPlaywrightCases,
  playwrightCasesPerProcess,
  runPlaywrightBatches,
} from "../scripts/playwright-isolation.mjs";

const runnerUrl = new URL("../scripts/run-playwright.mjs", import.meta.url);

describe("Playwright runner process ownership", () => {
  it("launches installed CLIs directly instead of resolving them through Corepack", async () => {
    const source = await readFile(runnerUrl, "utf8");

    expect(source).toContain(
      'new URL("../node_modules/playwright/cli.js", import.meta.url)',
    );
    expect(source).toContain('"playwright-list"');
    expect(source).toContain("batchedPlaywrightArgs(");
    expect(source).toContain("OVERGOAL_PLAYWRIGHT_BATCH_TOTAL");
    expect(source).not.toContain(
      'spawnOwned("playwright", "corepack", playwrightArgs',
    );
    expect(source).not.toContain('runOwned("corepack-enable"');
  });

  it("runs bounded, project-specific batches serially and continues after a failed batch", async () => {
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
    const batches = groupPlaywrightCases(cases, 2);
    const visited = [];
    let activeBatches = 0;
    let maximumActiveBatches = 0;
    const failures = await runPlaywrightBatches(
      batches,
      async (batch, index) => {
        activeBatches += 1;
        maximumActiveBatches = Math.max(maximumActiveBatches, activeBatches);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1));
          visited.push(
            `${batch.projectName}:${batch.cases.map((entry) => entry.title).join(",")}`,
          );
          if (index === 0) throw new Error("synthetic browser failure");
        } finally {
          activeBatches -= 1;
        }
      },
    );

    expect(visited).toEqual([
      "chromium:renders OPEN_PLAY (mobile),renders FREE_KICK",
      "mobile-chromium:renders OPEN_PLAY (mobile)",
    ]);
    expect(maximumActiveBatches).toBe(1);
    expect(activeBatches).toBe(0);
    expect(failures).toHaveLength(1);
    expect(batchedPlaywrightArgs("playwright.js", batches[0], 0)).toEqual([
      "playwright.js",
      "test",
      "e2e/tactical-kick.spec.ts:10",
      "--project=chromium",
      "--grep",
      "(?:renders OPEN_PLAY \\(mobile\\)|renders FREE_KICK)$",
      "--output=test-results/batched/001-chromium",
    ]);
  });

  it("isolates WebGL cases by default and rejects unsafe overrides", () => {
    expect(playwrightCasesPerProcess()).toBe(1);
    expect(playwrightCasesPerProcess("16")).toBe(16);
    expect(() => playwrightCasesPerProcess("0")).toThrow("CASES_PER_PROCESS");
    expect(() => playwrightCasesPerProcess("17")).toThrow("CASES_PER_PROCESS");
    expect(() => groupPlaywrightCases([], 0)).toThrow("positive integer");
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
