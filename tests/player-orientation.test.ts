import { describe, expect, it } from "vitest";

import {
  advancePlayerRotation,
  normalizePlayerAngle,
  rotationTowardsFieldTarget,
} from "../src/match/player-orientation";

describe("M2-I8 player orientation", () => {
  it("uses the shortest turn without snapping in one normal render frame", () => {
    const target = Math.PI;
    const firstFrame = advancePlayerRotation(0, target, 1 / 60, 9);

    expect(firstFrame).not.toBe(target);
    expect(Math.abs(firstFrame)).toBeGreaterThan(0);
    expect(Math.abs(firstFrame)).toBeLessThan(Math.PI / 2);

    let current = firstFrame;
    for (let frame = 0; frame < 60; frame += 1) {
      current = advancePlayerRotation(current, target, 1 / 60, 9);
    }
    expect(Math.abs(normalizePlayerAngle(target - current))).toBeLessThan(
      0.001,
    );
  });

  it("derives facing from the same metric field axes as rendered positions", () => {
    expect(
      rotationTowardsFieldTarget({ x: 50, y: 40 }, { x: 50, y: 0 }),
    ).toBeCloseTo(Math.PI, 6);
    expect(
      rotationTowardsFieldTarget({ x: 50, y: 40 }, { x: 60, y: 40 }),
    ).toBeCloseTo(Math.PI / 2, 6);
  });

  it("does not advance when frame time is non-positive", () => {
    expect(advancePlayerRotation(0.4, 1.2, -1, 9)).toBeCloseTo(0.4, 6);
  });
});
