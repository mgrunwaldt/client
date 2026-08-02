import { DefaultLoadingManager } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loader = vi.hoisted(() => {
  const state = {
    active: false,
    errors: [] as string[],
    item: "",
    loaded: 0,
    progress: 0,
    total: 0,
  };
  const listeners = new Set<() => void>();
  const resource = {
    clear: vi.fn(),
    preload: vi.fn(),
  };
  return {
    emit() {
      listeners.forEach((listener) => listener());
    },
    fbx: { ...resource, clear: vi.fn(), preload: vi.fn() },
    gltf: { ...resource, clear: vi.fn(), preload: vi.fn() },
    state,
    texture: { ...resource, clear: vi.fn(), preload: vi.fn() },
    useProgress: {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});

vi.mock("@react-three/drei", () => ({
  useFBX: loader.fbx,
  useGLTF: loader.gltf,
  useProgress: loader.useProgress,
  useTexture: loader.texture,
}));

describe("match field preload recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.assign(loader.state, {
      active: false,
      errors: [],
      item: "",
      loaded: 0,
      progress: 0,
      total: 0,
    });
    vi.stubGlobal("window", {
      clearInterval: globalThis.clearInterval.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears failed caches and primes every asset again before retrying", async () => {
    const { preloadMatchFieldAssets } = await import(
      "../src/app/(game)/field-assets"
    );

    loader.state.active = true;
    loader.state.total = 1;
    const failed = preloadMatchFieldAssets();
    loader.state.active = false;
    loader.state.errors = ["/models/in-game/game_model_1.fbx"];
    loader.emit();

    await expect(failed).rejects.toThrow(
      "Unable to preload match asset /models/in-game/game_model_1.fbx.",
    );
    expect(loader.fbx.clear).toHaveBeenCalled();
    expect(loader.gltf.clear).toHaveBeenCalled();
    expect(loader.texture.clear).toHaveBeenCalled();
    const firstPrimeCount = loader.fbx.preload.mock.calls.length;

    loader.state.active = false;
    const retry = preloadMatchFieldAssets();
    await expect(retry).resolves.toBeUndefined();
    expect(loader.fbx.preload.mock.calls.length).toBeGreaterThan(
      firstPrimeCount,
    );
  });

  it("redirects obsolete embedded FBX texture paths", async () => {
    await import("../src/app/(game)/field-assets");

    expect(
      DefaultLoadingManager.resolveURL(
        "/models/in-game/Accesories_Mat_BaseColor.png",
      ),
    ).toBe("/models/Male/new-text/Accesories_Mat_1.png");
    expect(
      DefaultLoadingManager.resolveURL(
        "/models/in-game/MainBody_Skin1_BaseColor.png",
      ),
    ).toBe("/models/in-game/textures/defenders/BaseTeam_1_Skin_1.png");
    expect(DefaultLoadingManager.resolveURL("/field/aim-arrow-head.svg")).toBe(
      "/field/aim-arrow-head.svg",
    );
  });
});
