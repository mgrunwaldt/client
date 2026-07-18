import RAPIER from "@dimforge/rapier3d";

export * from "@dimforge/rapier3d";

// The external-WASM package initializes during module evaluation; R3F expects
// the compat package's async init contract before constructing the world.
export async function init() {
  RAPIER.version();
}

export default RAPIER;
