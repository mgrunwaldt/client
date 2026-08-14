// ST.glb contains scenic margins around a pitch-line alpha map. These values
// register the alpha-map touchlines and goal lines to the regulation 68x105m
// world instead of compensating with per-player or camera offsets.
export const STADIUM_REGISTRATION = {
  scale: [8.236656242437265, 3.14398324527755, 5.208574408381318] as const,
  position: [0, 0.1704510337781442, 0] as const,
  goalMeshScale: [0.6918731021546813, 1, 0.9958870780328308] as const,
  // The visible goal frame is embedded in Stadiump1 rather than GoalNet.
  // These source-space bounds isolate both frame components so their width
  // follows the same regulation registration as the net and match engine.
  embeddedGoalFrame: {
    maxAbsX: 1.02,
    minAbsZ: 10.1,
    maxAbsZ: 11.15,
  },
  source: {
    textureSizePx: 4096,
    // Pitch_mesh maps its physical width to UV 1/6..5/6, not 0..1. These
    // centers register the visible lines to the same 68x105m backend world.
    touchlineCentersPx: [1309, 2787] as const,
    goalLineCentersPx: [240.5, 3849.5] as const,
    pitchPlaneSize: [15.2528931, 22.87934] as const,
    pitchPlaneUvSpan: [2 / 3, 1] as const,
    pitchPlaneGeometryY: -0.004999999888241291,
    pitchPlanePositionY: 0.2,
    pitchPlaneScaleY: 50.843,
  },
} as const;

export function registeredEmbeddedGoalFrameX(x: number, z: number) {
  const bounds = STADIUM_REGISTRATION.embeddedGoalFrame;
  const absZ = Math.abs(z);
  return Math.abs(x) <= bounds.maxAbsX &&
    absZ >= bounds.minAbsZ &&
    absZ <= bounds.maxAbsZ
    ? x * STADIUM_REGISTRATION.goalMeshScale[0]
    : x;
}
