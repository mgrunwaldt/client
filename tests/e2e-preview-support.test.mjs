import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  previewCacheControl,
  previewContentType,
  resolvePreviewRequestPath,
} from "../scripts/e2e-preview-support.mjs";

const fixtureRoots = [];

async function previewFixture() {
  const root = await mkdtemp(join(tmpdir(), "overgoal-preview-test-"));
  fixtureRoots.push(root);
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<main>Overgoal</main>");
  await writeFile(join(root, "assets", "index-build.css"), "body{}\n");
  return root;
}

describe("E2E production preview support", () => {
  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map((root) => rm(root, { recursive: true })),
    );
  });

  it("serves built assets and uses the SPA index for extensionless routes", async () => {
    const root = await previewFixture();
    const asset = await resolvePreviewRequestPath(
      root,
      "/assets/index-build.css",
    );
    const route = await resolvePreviewRequestPath(root, "/match/match-1");

    expect(asset?.path).toBe(join(root, "assets", "index-build.css"));
    expect(route?.path).toBe(join(root, "index.html"));
  });

  it("rejects traversal and missing file requests without an SPA fallback", async () => {
    const root = await previewFixture();

    await expect(
      resolvePreviewRequestPath(root, "/%2e%2e%2foutside.txt"),
    ).resolves.toBeNull();
    await expect(
      resolvePreviewRequestPath(root, "/assets/missing.css"),
    ).resolves.toBeNull();
    await expect(
      resolvePreviewRequestPath(root, "/%E0%A4%A"),
    ).rejects.toBeInstanceOf(URIError);
  });

  it("sets immutable build-asset caching and explicit content types", async () => {
    const root = await previewFixture();

    expect(previewCacheControl(join(root, "assets", "index-build.css"))).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(previewCacheControl(join(root, "models", "Ball.glb"))).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(previewCacheControl(join(root, "index.html"))).toBe("no-cache");
    expect(previewContentType("index.css")).toBe("text/css; charset=utf-8");
    expect(previewContentType("engine.wasm")).toBe("application/wasm");
    expect(previewContentType("model.unknown")).toBe(
      "application/octet-stream",
    );
  });
});
