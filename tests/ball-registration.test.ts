import { describe, expect, it } from "vitest";

import { BALL_MODEL_REGISTRATION } from "../src/match/ball-registration";

describe("M2-I8 ball registration", () => {
  it("keeps physical radius authoritative while preserving mobile readability", () => {
    expect(BALL_MODEL_REGISTRATION.radiusM).toBe(0.11);
    expect(
      BALL_MODEL_REGISTRATION.sourceRadius *
        BALL_MODEL_REGISTRATION.visualScale,
    ).toBeCloseTo(BALL_MODEL_REGISTRATION.radiusM, 8);

    const projectedIndicatorDiameterCssPx =
      (BALL_MODEL_REGISTRATION.readabilityIndicatorOuterRadiusM * 2 * 844) /
      (50 * 1.05);
    expect(projectedIndicatorDiameterCssPx).toBeGreaterThanOrEqual(12);
  });
});
