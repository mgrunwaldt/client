import { describe, expect, it } from "vitest";

import {
  registeredEmbeddedGoalFrameX,
  STADIUM_REGISTRATION,
} from "../src/match/stadium-registration";

describe("M2-I8 stadium registration", () => {
  it("places pitch lines on the regulation field corners and pitch plane", () => {
    const source = STADIUM_REGISTRATION.source;
    const textureHalfWidth =
      ((source.touchlineCentersPx[1] - source.touchlineCentersPx[0]) /
        2 /
        source.textureSizePx) *
      (source.pitchPlaneSize[0] / source.pitchPlaneUvSpan[0]);
    const textureHalfLength =
      ((source.goalLineCentersPx[1] - source.goalLineCentersPx[0]) /
        2 /
        source.textureSizePx) *
      (source.pitchPlaneSize[1] / source.pitchPlaneUvSpan[1]);

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

  it("uses the backend regulation dimensions for the visible penalty area", () => {
    const source = STADIUM_REGISTRATION.source;
    const pitchWidthPx =
      source.touchlineCentersPx[1] - source.touchlineCentersPx[0];
    const pitchLengthPx =
      source.goalLineCentersPx[1] - source.goalLineCentersPx[0];
    const penaltyAreaWidthPx = (40.32 / 68) * pitchWidthPx;
    const penaltyAreaDepthPx = (16.5 / 105) * pitchLengthPx;

    expect(penaltyAreaWidthPx).toBeCloseTo(876.367059, 5);
    expect(penaltyAreaDepthPx).toBeCloseTo(567.128571, 5);
  });

  it("widens the source goal by 50% while preserving its goal line", () => {
    const sourceGoalHalfWidth = 0.9633740782737732;
    const sourceGoalFront = 10.121161;

    expect(
      sourceGoalHalfWidth *
        STADIUM_REGISTRATION.scale[0] *
        STADIUM_REGISTRATION.goalMeshScale[0],
    ).toBeCloseTo(5.49, 6);
    expect(
      sourceGoalFront *
        STADIUM_REGISTRATION.scale[2] *
        STADIUM_REGISTRATION.goalMeshScale[2],
    ).toBeCloseTo(52.5, 6);
  });

  it("registers the embedded visible frame without moving nearby stadium geometry", () => {
    const sourceFrameHalfWidth = 1.0115426778793335;
    const registeredHalfWidth =
      registeredEmbeddedGoalFrameX(sourceFrameHalfWidth, -10.5) *
      STADIUM_REGISTRATION.scale[0];

    expect(registeredHalfWidth).toBeCloseTo(5.76, 2);
    expect(registeredEmbeddedGoalFrameX(8.2, -10.5)).toBe(8.2);
    expect(registeredEmbeddedGoalFrameX(1, -9)).toBe(1);
  });
});
