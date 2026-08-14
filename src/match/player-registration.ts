/**
 * Character art was authored for the legacy 2.8 world-units-per-field-unit
 * scene. Preserve that mobile screen footprint after moving the pitch to
 * metres without changing the backend-owned 2 m contact reach.
 */
export const PLAYER_MODEL_REGISTRATION = {
  legacyVisualScale: 0.1,
  legacyLengthScale: 2.8,
  metricLengthScale: 1.05,
  authoritativeReachHeightM: 2,
  minimumSourceBodyWidth: 77.21851881989699,
  visualScale: 0.045,
  portraitWidthCompensation: 1.38,
} as const;
