import type {
  FieldViewport,
  FieldViewWindow,
  WorldPoint,
} from "./field-transform";
import { createFieldTransform, FIELD_WORLD_SCALE } from "./field-transform";

// Keep the established elevated top-down view while deriving every ground
// projection from the backend-authored normalized view window.
export const FIELD_CAMERA_TILT_RADIANS = 0.7;
export const FIELD_CAMERA_DISTANCE_M = 300;

export type FieldCameraPose = {
  position: [number, number, number];
  rotation: [number, number, number];
  frustum: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  focus: WorldPoint;
};

export function createFieldCameraPose(view: FieldViewWindow): FieldCameraPose {
  const transform = createFieldTransform({
    viewport: { width: 1, height: 1 },
    view,
  });
  const focus = transform.cameraCenter;
  const projectedGroundHeight =
    view.height * FIELD_WORLD_SCALE.z * Math.sin(FIELD_CAMERA_TILT_RADIANS);
  const worldWidth = view.width * FIELD_WORLD_SCALE.x;

  return {
    position: [
      focus.x,
      focus.y + FIELD_CAMERA_DISTANCE_M * Math.sin(FIELD_CAMERA_TILT_RADIANS),
      focus.z + FIELD_CAMERA_DISTANCE_M * Math.cos(FIELD_CAMERA_TILT_RADIANS),
    ],
    rotation: [-FIELD_CAMERA_TILT_RADIANS, 0, 0],
    frustum: {
      left: -worldWidth / 2,
      right: worldWidth / 2,
      top: projectedGroundHeight / 2,
      bottom: -projectedGroundHeight / 2,
    },
    focus,
  };
}

/**
 * Mirrors the orthographic camera projection without WebGL. Ground points are
 * identical to fieldToScreen; positive authoritative height rises on screen.
 */
export function projectWorldPoint(
  point: WorldPoint,
  pose: FieldCameraPose,
  viewport: FieldViewport,
) {
  const cameraX = point.x - pose.focus.x;
  const cameraY =
    Math.cos(FIELD_CAMERA_TILT_RADIANS) * (point.y - pose.focus.y) -
    Math.sin(FIELD_CAMERA_TILT_RADIANS) * (point.z - pose.focus.z);
  const frustumWidth = pose.frustum.right - pose.frustum.left;
  const frustumHeight = pose.frustum.top - pose.frustum.bottom;

  return {
    x: ((cameraX - pose.frustum.left) / frustumWidth) * viewport.width,
    y: ((pose.frustum.top - cameraY) / frustumHeight) * viewport.height,
  };
}
