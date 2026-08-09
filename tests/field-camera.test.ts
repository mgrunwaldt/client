import { describe, expect, it } from "vitest";

import {
  createFieldCameraPose,
  projectWorldPoint,
} from "../src/match/field-camera";
import {
  createFieldTransform,
  fixedAttackingView,
  followLegendView,
} from "../src/match/field-transform";

describe("M2-I8 field camera", () => {
  it("projects every ground anchor through the same backend view window", () => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ];
    const views = [fixedAttackingView(), followLegendView({ x: 8, y: 93 })];
    const anchors = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 44.62, y: 0 },
      { x: 79.65, y: 15.71 },
      { x: 8, y: 93 },
    ];

    for (const viewport of viewports) {
      for (const view of views) {
        const transform = createFieldTransform({ viewport, view });
        const pose = createFieldCameraPose(view);

        for (const anchor of anchors) {
          const expected = transform.fieldToScreen(anchor);
          const actual = projectWorldPoint(
            transform.fieldToWorld(anchor),
            pose,
            viewport,
          );
          expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("renders authoritative height above its ground projection", () => {
    const viewport = { width: 390, height: 844 };
    const view = fixedAttackingView();
    const transform = createFieldTransform({ viewport, view });
    const pose = createFieldCameraPose(view);
    const ground = projectWorldPoint(
      transform.fieldToWorld({ x: 50, y: 20, z: 0 }),
      pose,
      viewport,
    );
    const lob = projectWorldPoint(
      transform.fieldToWorld({ x: 50, y: 20, z: 2.01 }),
      pose,
      viewport,
    );

    expect(lob.x).toBeCloseTo(ground.x, 6);
    expect(lob.y).toBeLessThan(ground.y);
  });

  it("keeps the backend follow window outside pitch bounds without clamping", () => {
    const view = followLegendView({ x: 95, y: 96 });
    const pose = createFieldCameraPose(view);

    expect(view).toEqual({ left: 45, top: 56, width: 100, height: 50 });
    expect(pose.focus.x).toBeCloseTo(30.6, 6);
    expect(pose.focus.z).toBeCloseTo(32.55, 6);
  });
});
