import { describe, expect, it } from "vitest";

import {
  deriveFieldVisualPhase,
  type FieldVisualPhase,
} from "../src/match/field-visual-phase";
import type { MatchSessionPhase } from "../src/match/session-types";

const base = {
  active: true,
  hasBlockingError: false,
  hasRenderedScene: false,
  hasResult: false,
  interactionReady: true,
  resultAnimating: false,
  resultContinuing: false,
  sessionPhase: "scene_ready" as MatchSessionPhase,
};

describe("FIELD visual phase", () => {
  it.each<[string, Partial<typeof base>, FieldVisualPhase]>([
    ["loads the first unready scene", { interactionReady: false }, "loading"],
    ["shows one ready playable scene", {}, "playable"],
    [
      "animates an authoritative result",
      { hasResult: true, resultAnimating: true },
      "resolving",
    ],
    ["holds the resolved scene", { hasResult: true }, "resolved"],
    [
      "transitions after accepted continue",
      { resultContinuing: true },
      "transitioning",
    ],
    [
      "keeps a warm scene hidden while it changes",
      { interactionReady: false, hasRenderedScene: true },
      "transitioning",
    ],
    ["blocks recoverable errors", { hasBlockingError: true }, "blocked"],
    [
      "blocks result playback without a staged result",
      { sessionPhase: "result_playback" },
      "blocked",
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(deriveFieldVisualPhase({ ...base, ...overrides })).toBe(expected);
  });

  it("never replaces a result with a loader while render readiness changes", () => {
    expect(
      deriveFieldVisualPhase({
        ...base,
        hasResult: true,
        interactionReady: false,
        resultAnimating: true,
      }),
    ).toBe("resolving");
  });
});
