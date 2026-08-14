import { describe, expect, it } from "vitest";

import { FIELD_CAMERA_ZOOM } from "../src/match/field-camera";
import { FIELD_WORLD_SCALE } from "../src/match/field-transform";
import { PLAYER_MODEL_REGISTRATION } from "../src/match/player-registration";

describe("M2-I8 player model registration", () => {
  it("preserves readable player art without changing contact reach", () => {
    expect(PLAYER_MODEL_REGISTRATION.visualScale).toBe(0.045);
    expect(PLAYER_MODEL_REGISTRATION.portraitWidthCompensation).toBe(1.38);
    expect(PLAYER_MODEL_REGISTRATION.authoritativeReachHeightM).toBe(2);

    const minimumBodyWidthCssPx =
      (PLAYER_MODEL_REGISTRATION.minimumSourceBodyWidth *
        PLAYER_MODEL_REGISTRATION.visualScale *
        PLAYER_MODEL_REGISTRATION.portraitWidthCompensation *
        390 *
        FIELD_CAMERA_ZOOM) /
      (100 * FIELD_WORLD_SCALE.x);
    expect(minimumBodyWidthCssPx).toBeGreaterThanOrEqual(28);
  });
});
