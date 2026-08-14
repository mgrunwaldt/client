import { useFBX, useGLTF, useProgress, useTexture } from "@react-three/drei";
import { DefaultLoadingManager } from "three";

const defenderTextures = [
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_1.png",
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_2.png",
  "/models/in-game/textures/defenders/BaseTeam_1_Skin_3.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_1.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_2.png",
  "/models/in-game/textures/defenders/BaseTeam_2_Skin_3.png",
];

const goalkeeperTextures = [
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_1.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_2.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_1_Skin_3.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_1.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_2.png",
  "/models/in-game/textures/goalkeepers/Goalkeeper_2_Skin_3.png",
];

const accessoryTextures = [
  "/models/Male/new-text/Accesories_Mat_1.png",
  "/models/Male/new-text/Accesories_Mat_2.png",
  "/models/Male/new-text/Accesories_Mat_3.png",
  "/models/Male/new-text/Accesories_Mat_4.png",
  "/models/Male/new-text/Accesories_Mat_5.png",
  "/models/Male/new-text/Accesories_Mat_6.png",
  "/models/Male/new-text/Accesories_Mat_7.png",
];

const legacyEmbeddedTextureRedirects = new Map([
  ["Accesories_Mat_BaseColor.png", accessoryTextures[0]],
  ["MainBody_Skin1_BaseColor.png", defenderTextures[0]],
]);

// The shipped FBX files contain obsolete absolute authoring-machine paths.
// Redirect their basenames to maintained runtime textures before any model loads.
DefaultLoadingManager.setURLModifier((url) => {
  const segments = url.replace(/\\/gu, "/").split("/");
  const basename = segments[segments.length - 1] ?? url;
  return legacyEmbeddedTextureRedirects.get(basename) ?? url;
});

const fieldTextures = [
  "/models/in-game/textures/pitch/regulation-lines.svg",
  "/models/in-game/Net.png",
  "/models/in-game/textures/pitch/overgoal-turf.webp",
  "/field/aim-arrow-shaft.svg",
  "/field/aim-arrow-head.svg",
  "/field/aim-arrow-tip-glow.svg",
];

const playerModels = [
  "/models/in-game/game_model_1.fbx",
  "/models/in-game/game_model_2.fbx",
  "/models/in-game/game_model_3.fbx",
];

const playerAnimations = [
  "/models/in-game/animations/DefensiveIdle.fbx",
  "/models/in-game/animations/JogForward.fbx",
  "/models/in-game/animations/JogForwardDiagonalLeft.fbx",
  "/models/in-game/animations/JogForwardDiagonalRight.fbx",
  "/models/in-game/animations/StrikeForwardJog.fbx",
];

const gltfModels = ["/models/in-game/ST.glb", "/models/in-game/Ball/Ball.glb"];

export const MATCH_FIELD_ASSET_COUNT =
  defenderTextures.length +
  goalkeeperTextures.length +
  accessoryTextures.length +
  fieldTextures.length +
  playerModels.length +
  playerAnimations.length +
  gltfModels.length;

let assetsPrimed = false;
let activePreload: Promise<void> | null = null;

function clearMatchFieldAssetCache() {
  gltfModels.forEach((asset) => useGLTF.clear(asset));
  [...playerModels, ...playerAnimations].forEach((asset) =>
    useFBX.clear(asset),
  );
  [
    ...defenderTextures,
    ...goalkeeperTextures,
    ...accessoryTextures,
    ...fieldTextures,
  ].forEach((asset) => useTexture.clear(asset));
  assetsPrimed = false;
}

export function primeMatchFieldAssets() {
  if (assetsPrimed) return;
  assetsPrimed = true;

  gltfModels.forEach((asset) => useGLTF.preload(asset));
  [...playerModels, ...playerAnimations].forEach((asset) =>
    useFBX.preload(asset),
  );

  [
    ...defenderTextures,
    ...goalkeeperTextures,
    ...accessoryTextures,
    ...fieldTextures,
  ].forEach((asset) => useTexture.preload(asset));
}

export interface MatchFieldPreloadProgress {
  loaded: number;
  total: number;
  progress: number;
  currentAsset: string;
}

export function preloadMatchFieldAssets(
  onProgress?: (progress: MatchFieldPreloadProgress) => void,
) {
  primeMatchFieldAssets();
  if (activePreload) return activePreload;

  const initialErrorCount = useProgress.getState().errors.length;
  activePreload = new Promise<void>((resolve, reject) => {
    let settled = false;
    let sawActivity = useProgress.getState().active;
    let idleChecks = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => {};

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (interval !== null) clearInterval(interval);
      if (timeout !== null) clearTimeout(timeout);
      unsubscribe();
      if (error) {
        clearMatchFieldAssetCache();
        activePreload = null;
        reject(error);
      } else {
        activePreload = Promise.resolve();
        resolve();
      }
    };

    const inspect = () => {
      const state = useProgress.getState();
      sawActivity ||= state.active;
      onProgress?.({
        loaded: state.loaded,
        total: state.total,
        progress: state.active ? state.progress : 100,
        currentAsset: state.item,
      });

      if (state.errors.length > initialErrorCount) {
        finish(
          new Error(
            `Unable to preload match asset ${state.errors[state.errors.length - 1] ?? "(unknown)"}.`,
          ),
        );
        return;
      }

      if (!state.active) {
        idleChecks += 1;
        // Two idle observations distinguish a completed/cache hit from the
        // brief scheduling gap before Three's loading manager starts.
        if (sawActivity || idleChecks >= 2) finish();
      } else {
        idleChecks = 0;
      }
    };

    unsubscribe = useProgress.subscribe(inspect);
    interval = setInterval(inspect, 50);
    timeout = setTimeout(() => {
      if (!settled) {
        finish(new Error("Timed out while preparing the match field."));
      }
    }, 30_000);
    inspect();
  });

  return activePreload;
}
