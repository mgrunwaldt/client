// ST.glb contains scenic margins around a pitch-line alpha map. These values
// register the alpha-map touchlines and goal lines to the regulation 68x105m
// world instead of compensating with per-player or camera offsets.
export const STADIUM_REGISTRATION = {
  scale: [8.236656242437265, 3.14398324527755, 5.208574408381318] as const,
  position: [0, 0.1704510337781442, 0] as const,
  goalMeshScale: [0.4612487347697875, 1, 0.9958870780328308] as const,
  source: {
    textureSizePx: 4096,
    touchlineCentersPx: [946.5, 3163.5] as const,
    goalLineCentersPx: [240.5, 3849.5] as const,
    pitchPlaneSize: [15.2528931, 22.87934] as const,
    pitchPlaneGeometryY: -0.004999999888241291,
    pitchPlanePositionY: 0.2,
    pitchPlaneScaleY: 50.843,
  },
} as const;
