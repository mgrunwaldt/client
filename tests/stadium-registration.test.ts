import { describe, expect, it } from "vitest";

import { STADIUM_REGISTRATION } from "../src/match/stadium-registration";

describe("M2-I8 stadium registration", () => {
  it("places pitch lines on the regulation field corners and pitch plane", () => {
    const source = STADIUM_REGISTRATION.source;
    const textureHalfWidth =
      ((source.touchlineCentersPx[1] - source.touchlineCentersPx[0]) /
        2 /
        source.textureSizePx) *
      source.pitchPlaneSize[0];
    const textureHalfLength =
      ((source.goalLineCentersPx[1] - source.goalLineCentersPx[0]) /
        2 /
        source.textureSizePx) *
      source.pitchPlaneSize[1];

    expect(textureHalfWidth * STADIUM_REGISTRATION.scale[0]).toBeCloseTo(34, 6);
    expect(textureHalfLength * STADIUM_REGISTRATION.scale[2]).toBeCloseTo(
      52.5,
      6,
    );
    expect(
      (source.pitchPlanePositionY +
        source.pitchPlaneGeometryY * source.pitchPlaneScaleY) *
        STADIUM_REGISTRATION.scale[1] +
        STADIUM_REGISTRATION.position[1],
    ).toBeCloseTo(0, 6);
  });

  it("normalizes the oversized source goal to regulation posts and goal line", () => {
    const sourceGoalHalfWidth = 0.9633740782737732;
    const sourceGoalFront = 10.121161;

    expect(
      sourceGoalHalfWidth *
        STADIUM_REGISTRATION.scale[0] *
        STADIUM_REGISTRATION.goalMeshScale[0],
    ).toBeCloseTo(3.66, 6);
    expect(
      sourceGoalFront *
        STADIUM_REGISTRATION.scale[2] *
        STADIUM_REGISTRATION.goalMeshScale[2],
    ).toBeCloseTo(52.5, 6);
  });
});
