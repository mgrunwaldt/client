import type { MatchSessionPhase } from "./session-types";

export type FieldVisualPhase =
  | "loading"
  | "playable"
  | "resolving"
  | "resolved"
  | "transitioning"
  | "blocked";

export function deriveFieldVisualPhase(input: {
  active: boolean;
  hasBlockingError: boolean;
  hasRenderedScene: boolean;
  hasResult: boolean;
  interactionReady: boolean;
  resultAnimating: boolean;
  resultContinuing: boolean;
  sessionPhase: MatchSessionPhase;
}): FieldVisualPhase {
  if (!input.active || input.resultContinuing) return "transitioning";
  if (input.hasBlockingError) return "blocked";
  if (input.hasResult) {
    return input.resultAnimating ? "resolving" : "resolved";
  }
  if (!input.interactionReady) {
    return input.hasRenderedScene ? "transitioning" : "loading";
  }
  if (input.sessionPhase === "result_playback") return "blocked";
  return "playable";
}
