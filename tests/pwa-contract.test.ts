import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("installable mobile shell", () => {
  it("declares a standalone manifest and mobile-safe document chrome", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../public/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const html = await readFile(
      new URL("../index.html", import.meta.url),
      "utf8",
    );

    expect(manifest).toMatchObject({
      display: "standalone",
      orientation: "portrait",
      start_url: "/",
      theme_color: "#020816",
    });
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('name="theme-color"');
  });

  it("ships a navigation fallback without caching API commands", async () => {
    const worker = await readFile(
      new URL("../public/sw.js", import.meta.url),
      "utf8",
    );
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('cache.match("/index.html")');
  });
});
