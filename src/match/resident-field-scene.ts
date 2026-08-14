import type { MatchSessionPhase } from "./session-types";

const fieldPresentationPhases = new Set<MatchSessionPhase>([
  "scene_ready",
  "submitting",
  "result_playback",
  "unsupported_recovery",
]);

export function shouldAdoptResidentFieldScene(phase: MatchSessionPhase) {
  return fieldPresentationPhases.has(phase);
}
