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
      display_override: ["fullscreen", "standalone"],
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
    expect(worker).toContain('url.pathname.startsWith("/assets/")');
    expect(worker).toContain('cache.match("/index.html")');
    expect(worker).not.toContain("skipWaiting");
  });

  it("uses shared safe-area tokens across every match-facing surface", async () => {
    const css = await readFile(
      new URL("../src/styles/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain("--overgoal-safe-top: env(safe-area-inset-top");
    expect(css).toContain(".overgoal-safe-screen");

    const safeScreenSources = [
      "../src/app/(login)/Login/LoginScreen.tsx",
      "../src/app/(main)/Home/HomePage.tsx",
      "../src/app/(main)/Pre-Match/pre-match.tsx",
      "../src/app/(main)/Match/MatchScreen.tsx",
      "../src/app/(main)/Match-Result/MatchResultScreen.tsx",
      "../src/components/loader/LoadingScreen.tsx",
    ];
    for (const source of safeScreenSources) {
      expect(
        await readFile(new URL(source, import.meta.url), "utf8"),
      ).toContain("overgoal-safe-screen");
    }

    const fieldSource = await readFile(
      new URL("../src/app/(game)/GameScene.tsx", import.meta.url),
      "utf8",
    );
    expect(fieldSource).toContain("var(--overgoal-safe-top)");
    expect(fieldSource).toContain("var(--overgoal-safe-bottom)");
  });
});
