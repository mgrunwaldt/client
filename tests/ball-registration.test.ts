import { describe, expect, it } from "vitest";

import { BALL_MODEL_REGISTRATION } from "../src/match/ball-registration";
import { FIELD_CAMERA_ZOOM } from "../src/match/field-camera";
import { FIELD_WORLD_SCALE } from "../src/match/field-transform";

describe("M2-I8 ball registration", () => {
  it("keeps physical radius authoritative while preserving mobile readability", () => {
    expect(BALL_MODEL_REGISTRATION.radiusM).toBe(0.11);
    expect(
      BALL_MODEL_REGISTRATION.sourceRadius *
        BALL_MODEL_REGISTRATION.visualScale,
    ).toBeCloseTo(BALL_MODEL_REGISTRATION.visualRadiusM, 8);
    expect(BALL_MODEL_REGISTRATION.visualRadiusM).toBe(0.16);

    const projectedIndicatorDiameterCssPx =
      (BALL_MODEL_REGISTRATION.readabilityIndicatorOuterRadiusM *
        1.32 *
        2 *
        BALL_MODEL_REGISTRATION.portraitWidthCompensation *
        390 *
        FIELD_CAMERA_ZOOM) /
      (100 * FIELD_WORLD_SCALE.x);
    expect(projectedIndicatorDiameterCssPx).toBeGreaterThanOrEqual(12);
  });
});
