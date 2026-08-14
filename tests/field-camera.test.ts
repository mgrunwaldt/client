import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  CORNER_CAMERA_SIDE_OFFSET_M,
  CORNER_CAMERA_ZOOM,
  createFieldCameraPose,
  FIELD_CAMERA_DISTANCE_M,
  FIELD_CAMERA_FOCUS_Y_OFFSET,
  FIELD_CAMERA_TILT_RADIANS,
  FIELD_CAMERA_ZOOM,
  FOLLOW_CAMERA_FOCUS_Y_OFFSET,
  projectWorldPoint,
  screenPointToWorldPlane,
} from "../src/match/field-camera";
import {
  createFieldTransform,
  fixedAttackingView,
  followLegendView,
} from "../src/match/field-transform";

describe("M2-I8 field camera", () => {
  it("uses the closer, lower pose from behind the followed Legend", () => {
    const legend = { x: 50, y: 50 };
    const view = followLegendView(legend);
    const transform = createFieldTransform({
      viewport: { width: 390, height: 844 },
      view,
    });
    const pose = createFieldCameraPose(view, undefined, "FOLLOW_LEGEND");
    const legendWorld = transform.fieldToWorld(legend);

    expect(FIELD_CAMERA_DISTANCE_M).toBe(270);
    expect(FIELD_CAMERA_TILT_RADIANS).toBe(0.54);
    expect(FIELD_CAMERA_ZOOM).toBe(1.08);
    expect(pose.zoom).toBe(FIELD_CAMERA_ZOOM);
    expect(pose.position[1]).toBeCloseTo(
      FIELD_CAMERA_DISTANCE_M * Math.sin(FIELD_CAMERA_TILT_RADIANS),
      6,
    );
    expect(pose.position[2]).toBeGreaterThan(legendWorld.z);
  });

  it("keeps a followed Legend above the mobile HUD safe area", () => {
    const viewport = { width: 390, height: 844 };
    const legend = { x: 50, y: 50 };
    const view = followLegendView(legend);
    const transform = createFieldTransform({ viewport, view });
    const pose = createFieldCameraPose(view, undefined, "FOLLOW_LEGEND");
    const projected = projectWorldPoint(
      transform.fieldToWorld(legend),
      pose,
      viewport,
    );

    expect(FOLLOW_CAMERA_FOCUS_Y_OFFSET).toBe(4);
    expect(projected.y / viewport.height).toBeCloseTo(0.7376, 4);
  });

  it("frames corners from the authoritative sideline without moving the field", () => {
    const view = { left: 9.63, top: -6, width: 100, height: 50 };
    const rightCorner = createFieldCameraPose(view, 100);
    const leftCorner = createFieldCameraPose(view, 0);
    expect(rightCorner.focus.x).toBeCloseTo(23.8, 6);
    expect(leftCorner.focus.x).toBeCloseTo(-23.8, 6);
    expect(rightCorner.focus.z).toBeCloseTo(-35.7, 6);
    expect(leftCorner.focus.z).toBeCloseTo(-35.7, 6);
    expect(rightCorner.position[0]).toBeCloseTo(
      rightCorner.focus.x + CORNER_CAMERA_SIDE_OFFSET_M,
      6,
    );
    expect(leftCorner.position[0]).toBeCloseTo(
      leftCorner.focus.x - CORNER_CAMERA_SIDE_OFFSET_M,
      6,
    );
    expect(rightCorner.position[2]).toBe(rightCorner.focus.z);
    expect(leftCorner.position[2]).toBe(leftCorner.focus.z);
    expect(rightCorner.rotation[1]).not.toBe(0);
    expect(leftCorner.rotation[1]).toBeCloseTo(-rightCorner.rotation[1], 6);
    expect(rightCorner.zoom).toBe(CORNER_CAMERA_ZOOM);

    const viewport = { width: 390, height: 844 };
    const transform = createFieldTransform({ viewport, view });
    for (const anchor of [
      { x: 100, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 10.48 },
    ]) {
      const point = projectWorldPoint(
        transform.fieldToWorld(anchor),
        rightCorner,
        viewport,
      );
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(viewport.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(viewport.height);
    }

    const leftPost = projectWorldPoint(
      transform.fieldToWorld({ x: 41.93, y: 0 }),
      rightCorner,
      viewport,
    );
    const rightPost = projectWorldPoint(
      transform.fieldToWorld({ x: 58.07, y: 0 }),
      rightCorner,
      viewport,
    );
    expect(leftPost.x).toBeCloseTo(rightPost.x, 6);
    expect(Math.abs(leftPost.y - rightPost.y)).toBeGreaterThan(20);
  });

  it("projects every ground anchor through the same backend view window", () => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ];
    const views = [
      {
        focusOffset: FIELD_CAMERA_FOCUS_Y_OFFSET,
        mode: "FIXED_ATTACKING_THIRD" as const,
        view: fixedAttackingView(),
      },
      {
        focusOffset: FOLLOW_CAMERA_FOCUS_Y_OFFSET,
        mode: "FOLLOW_LEGEND" as const,
        view: followLegendView({ x: 8, y: 93 }),
      },
    ];
    const anchors = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 41.93, y: 0 },
      { x: 79.65, y: 15.71 },
      { x: 8, y: 93 },
    ];

    for (const viewport of viewports) {
      for (const { focusOffset, mode, view } of views) {
        const transform = createFieldTransform({ viewport, view });
        const pose = createFieldCameraPose(view, undefined, mode);

        for (const anchor of anchors) {
          const groundProjection = transform.fieldToScreen(anchor);
          const expected = {
            x:
              viewport.width / 2 +
              (groundProjection.x - viewport.width / 2) * FIELD_CAMERA_ZOOM,
            y:
              viewport.height / 2 +
              (groundProjection.y - viewport.height / 2) * FIELD_CAMERA_ZOOM -
              (focusOffset / view.height) * viewport.height * FIELD_CAMERA_ZOOM,
          };
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
    const pose = createFieldCameraPose(view, undefined, "FOLLOW_LEGEND");
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

  it("round-trips rendered ground points through the pointer camera on supported phones", () => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ];
    const view = fixedAttackingView();
    const pose = createFieldCameraPose(view, undefined, "FOLLOW_LEGEND");
    const fieldPoints = [
      { x: 18, y: 28 },
      { x: 50, y: 18 },
      { x: 82, y: 9 },
    ];

    for (const viewport of viewports) {
      const transform = createFieldTransform({ viewport, view });
      const camera = new THREE.OrthographicCamera(
        pose.frustum.left,
        pose.frustum.right,
        pose.frustum.top,
        pose.frustum.bottom,
        0.1,
        1000,
      );
      camera.position.set(...pose.position);
      camera.rotation.set(...pose.rotation);
      camera.zoom = pose.zoom;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      for (const fieldPoint of fieldPoints) {
        const worldPoint = transform.fieldToWorld(fieldPoint);
        const screenPoint = projectWorldPoint(worldPoint, pose, viewport);
        const pointerPoint = screenPointToWorldPlane(
          screenPoint,
          camera,
          viewport,
          worldPoint.y,
        );

        expect(pointerPoint).not.toBeNull();
        expect(pointerPoint?.x).toBeCloseTo(worldPoint.x, 5);
        expect(pointerPoint?.y).toBeCloseTo(worldPoint.y, 5);
        expect(pointerPoint?.z).toBeCloseTo(worldPoint.z, 5);
      }
    }
  });

  it("keeps the backend follow window outside pitch bounds without clamping", () => {
    const view = followLegendView({ x: 95, y: 96 });
    const pose = createFieldCameraPose(view, undefined, "FOLLOW_LEGEND");

    expect(view).toEqual({ left: 45, top: 56, width: 100, height: 50 });
    expect(pose.focus.x).toBeCloseTo(30.6, 6);
    expect(pose.focus.z).toBeCloseTo(36.75, 6);
  });
});
