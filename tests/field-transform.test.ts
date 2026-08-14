import { describe, expect, it } from "vitest";

import {
  createFieldTransform,
  FIELD_GEOMETRY,
  FIELD_WORLD_SCALE,
  type FieldPoint,
  type FieldViewport,
  fixedAttackingView,
  followLegendView,
  worldVectorToFieldAim,
} from "../src/match/field-transform";

const mobile: FieldViewport = { width: 390, height: 844 };
const desktop: FieldViewport = { width: 1440, height: 900 };

function expectClose(actual: number, expected: number, precision = 6) {
  expect(actual).toBeCloseTo(expected, precision);
}

function expectFieldClose(actual: FieldPoint, expected: FieldPoint) {
  expectClose(actual.x, expected.x);
  expectClose(actual.y, expected.y);
  expectClose(actual.z ?? 0, expected.z ?? 0);
}

function expectWorldClose(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
) {
  expectClose(actual.x, expected.x);
  expectClose(actual.y, expected.y);
  expectClose(actual.z, expected.z);
}

describe("M2-I8 field transform", () => {
  it("preserves the visible kick direction when converting to backend field aim", () => {
    const visibleDirection = { x: 1, z: -1 };
    const aim = worldVectorToFieldAim(visibleDirection);

    expect(aim).not.toBeNull();
    const simulatedWorldDirection = {
      x: aim!.x * FIELD_WORLD_SCALE.x,
      z: aim!.y * FIELD_WORLD_SCALE.z,
    };
    const simulatedMagnitude = Math.hypot(
      simulatedWorldDirection.x,
      simulatedWorldDirection.z,
    );
    expectClose(simulatedWorldDirection.x / simulatedMagnitude, Math.SQRT1_2);
    expectClose(simulatedWorldDirection.z / simulatedMagnitude, -Math.SQRT1_2);
    expect(Math.hypot(aim!.x, aim!.y)).toBeCloseTo(1);
  });

  it("rejects a zero-length world kick vector", () => {
    expect(worldVectorToFieldAim({ x: 0, z: 0 })).toBeNull();
  });

  it("maps the opponent goal, posts, and penalty-area corners to one world pitch", () => {
    const transform = createFieldTransform({
      viewport: desktop,
      view: fixedAttackingView(),
    });

    expectWorldClose(
      transform.fieldToWorld(FIELD_GEOMETRY.opponentGoalCenter),
      { x: 0, y: 0, z: -52.5 },
    );
    expectWorldClose(
      transform.fieldToWorld(FIELD_GEOMETRY.opponentGoalPosts[0]),
      { x: -5.4876, y: 0, z: -52.5 },
    );
    expectWorldClose(
      transform.fieldToWorld(FIELD_GEOMETRY.opponentGoalPosts[1]),
      { x: 5.4876, y: 0, z: -52.5 },
    );
    expectWorldClose(
      transform.fieldToWorld(FIELD_GEOMETRY.opponentPenaltyArea.topLeft),
      { x: -20.162, y: 0, z: -52.5 },
    );
    expectWorldClose(
      transform.fieldToWorld(FIELD_GEOMETRY.opponentPenaltyArea.bottomRight),
      { x: 20.162, y: 0, z: -36.0045 },
    );
  });

  it("projects the fixed attacking view consistently on mobile and desktop", () => {
    for (const viewport of [mobile, desktop]) {
      const transform = createFieldTransform({
        viewport,
        view: fixedAttackingView(),
      });

      expect(transform.fieldToScreen({ x: 50, y: 0, z: 0 })).toEqual({
        x: viewport.width / 2,
        y: viewport.height * 0.12,
        z: 0,
      });
      expect(transform.fieldToScreen({ x: 0, y: 50, z: 0 })).toEqual({
        x: 0,
        y: viewport.height * 1.12,
        z: 0,
      });
      expect(transform.fieldToScreen({ x: 100, y: 0, z: 0 })).toEqual({
        x: viewport.width,
        y: viewport.height * 0.12,
        z: 0,
      });
    }
  });

  it("uses the authoritative follow window without clamping stadium overscan", () => {
    const legend = { x: 8, y: 93, z: 0 };
    const view = followLegendView(legend);
    const transform = createFieldTransform({ viewport: mobile, view });

    expect(view).toEqual({ left: -42, top: 53, width: 100, height: 50 });
    expect(transform.fieldToScreen(legend)).toEqual({
      x: mobile.width / 2,
      y: mobile.height * 0.8,
      z: 0,
    });
    expectWorldClose(transform.cameraCenter, { x: -28.56, y: 0, z: 29.4 });
  });

  it("preserves ball height for world coordinates and DOM projection", () => {
    const transform = createFieldTransform({
      viewport: mobile,
      view: fixedAttackingView(),
    });
    const ball = { x: 61.25, y: 23.5, z: 2.4 };

    expectWorldClose(transform.fieldToWorld(ball), {
      x: 7.65,
      y: 2.4,
      z: -27.825,
    });
    const screenBall = transform.fieldToScreen(ball);
    expectClose(screenBall.x, 238.875);
    expectClose(screenBall.y, 497.96);
    expectClose(screenBall.z, 2.4);
  });

  it("round-trips ball, Legend, touchlines, and penalty geometry within one CSS pixel", () => {
    const points = [
      { x: 61.25, y: 23.5, z: 2.4 },
      { x: 37.5, y: 28, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      FIELD_GEOMETRY.opponentPenaltyArea.topLeft,
      FIELD_GEOMETRY.opponentPenaltyArea.bottomRight,
    ];

    for (const viewport of [mobile, desktop]) {
      const transform = createFieldTransform({
        viewport,
        view: followLegendView({ x: 37.5, y: 62, z: 0 }),
      });

      for (const point of points) {
        const screen = transform.fieldToScreen(point);
        const field = transform.screenToField(screen);
        const world = transform.fieldToWorld(point);

        expectFieldClose(field, point);
        expectClose(transform.worldToScreen(world).x, screen.x, 4);
        expectClose(transform.worldToScreen(world).y, screen.y, 4);
        expectClose(transform.worldToScreen(world).z, screen.z, 4);
        expectClose(transform.screenToWorld(screen).x, world.x, 4);
        expectClose(transform.screenToWorld(screen).y, world.y, 4);
        expectClose(transform.screenToWorld(screen).z, world.z, 4);
        expect(
          Math.abs(transform.fieldToScreen(field).x - screen.x),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(transform.fieldToScreen(field).y - screen.y),
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
