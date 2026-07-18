import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfigFromFile, transformWithEsbuild } from "vite";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

describe("player client bootstrap", () => {
  it("loads the Vite config and parses the HTML app entry", async () => {
    const loadedConfig = await loadConfigFromFile(
      { command: "build", mode: "test" },
      undefined,
      projectRoot,
    );
    const indexHtml = await readFile(
      new URL("../index.html", import.meta.url),
      "utf8",
    );
    const entry = await readFile(
      new URL("../src/main.tsx", import.meta.url),
      "utf8",
    );
    const transformedEntry = await transformWithEsbuild(entry, "src/main.tsx", {
      jsx: "automatic",
      loader: "tsx",
    });

    expect(loadedConfig?.config.server?.port).toBe(3002);
    expect(loadedConfig?.config.plugins).toHaveLength(3);
    expect(indexHtml).toContain('src="/src/main.tsx"');
    expect(transformedEntry.code).toContain("createRoot");
  });
});
