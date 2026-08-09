import { describe, expect, it } from "vitest";

import { PLAYER_MODEL_REGISTRATION } from "../src/match/player-registration";

describe("M2-I8 player model registration", () => {
  it("preserves readable player art without changing contact reach", () => {
    expect(PLAYER_MODEL_REGISTRATION.visualScale).toBeCloseTo(0.0375, 8);
    expect(PLAYER_MODEL_REGISTRATION.authoritativeReachHeightM).toBe(2);
  });
});
