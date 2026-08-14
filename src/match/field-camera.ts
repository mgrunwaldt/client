import * as THREE from "three";

import type {
  FieldViewport,
  FieldViewWindow,
  WorldPoint,
} from "./field-transform";
import { createFieldTransform, FIELD_WORLD_SCALE } from "./field-transform";

// Keep the established elevated top-down view while deriving every ground
// projection from the backend-authored normalized view window. The shorter,
// lower pose remains behind the Legend during follow framing without changing
// the authoritative ground projection.
export const FIELD_CAMERA_TILT_RADIANS = 0.54;
export const FIELD_CAMERA_DISTANCE_M = 270;
export const FIELD_CAMERA_ZOOM = 1.08;
export const FIELD_CAMERA_FOCUS_Y_OFFSET = -1.5;
export const FOLLOW_CAMERA_FOCUS_Y_OFFSET = 4;
export const CORNER_CAMERA_ZOOM = 1;
export const CORNER_CAMERA_SIDE_OFFSET_M =
  FIELD_CAMERA_DISTANCE_M * Math.cos(FIELD_CAMERA_TILT_RADIANS);

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
  zoom: number;
};

export function createFieldCameraPose(
  view: FieldViewWindow,
  cornerFieldX?: number,
  mode: "FIXED_ATTACKING_THIRD" | "FOLLOW_LEGEND" = "FIXED_ATTACKING_THIRD",
): FieldCameraPose {
  const focusYOffset =
    mode === "FOLLOW_LEGEND"
      ? FOLLOW_CAMERA_FOCUS_Y_OFFSET
      : FIELD_CAMERA_FOCUS_Y_OFFSET;
  const transform = createFieldTransform({
    viewport: { width: 1, height: 1 },
    view,
  });
  const focus = transform.fieldToWorld({
    x: view.left + view.width / 2,
    y: view.top + view.height / 2 + focusYOffset,
    z: 0,
  });
  const projectedGroundHeight =
    view.height * FIELD_WORLD_SCALE.z * Math.sin(FIELD_CAMERA_TILT_RADIANS);
  const worldWidth = view.width * FIELD_WORLD_SCALE.x;

  const position: [number, number, number] = [
    focus.x,
    focus.y + FIELD_CAMERA_DISTANCE_M * Math.sin(FIELD_CAMERA_TILT_RADIANS),
    focus.z + FIELD_CAMERA_DISTANCE_M * Math.cos(FIELD_CAMERA_TILT_RADIANS),
  ];
  let rotation: [number, number, number] = [-FIELD_CAMERA_TILT_RADIANS, 0, 0];
  let zoom = FIELD_CAMERA_ZOOM;

  if (cornerFieldX !== undefined) {
    const side = cornerFieldX >= 50 ? 1 : -1;
    const cornerFocus = transform.fieldToWorld({
      // Keep the actual corner comfortably above the mobile HUD instead of
      // centring the camera on an abstract 75% pitch-width anchor.
      x: 50 + side * 35,
      y: 16,
      z: 0,
    });
    // Orbit the established main camera exactly 90 degrees around the pitch.
    // This keeps its elevation while presenting the goal line vertically.
    position[0] = cornerFocus.x + side * CORNER_CAMERA_SIDE_OFFSET_M;
    position[1] =
      cornerFocus.y +
      FIELD_CAMERA_DISTANCE_M * Math.sin(FIELD_CAMERA_TILT_RADIANS);
    position[2] = cornerFocus.z;
    const camera = new THREE.OrthographicCamera();
    camera.position.set(...position);
    camera.lookAt(cornerFocus.x, cornerFocus.y, cornerFocus.z);
    rotation = [camera.rotation.x, camera.rotation.y, camera.rotation.z];
    zoom = CORNER_CAMERA_ZOOM;

    return {
      position,
      rotation,
      frustum: {
        left: -(view.height * FIELD_WORLD_SCALE.z) / 2,
        right: (view.height * FIELD_WORLD_SCALE.z) / 2,
        top:
          (view.width *
            FIELD_WORLD_SCALE.x *
            Math.sin(FIELD_CAMERA_TILT_RADIANS)) /
          2,
        bottom:
          (-view.width *
            FIELD_WORLD_SCALE.x *
            Math.sin(FIELD_CAMERA_TILT_RADIANS)) /
          2,
      },
      focus: cornerFocus,
      zoom,
    };
  }

  return {
    position,
    rotation,
    frustum: {
      left: -worldWidth / 2,
      right: worldWidth / 2,
      top: projectedGroundHeight / 2,
      bottom: -projectedGroundHeight / 2,
    },
    focus,
    zoom,
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
  const cameraRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...pose.rotation),
  );
  const cameraPoint = new THREE.Vector3(
    point.x - pose.position[0],
    point.y - pose.position[1],
    point.z - pose.position[2],
  ).applyQuaternion(cameraRotation.invert());
  const frustumWidth = pose.frustum.right - pose.frustum.left;
  const frustumHeight = pose.frustum.top - pose.frustum.bottom;

  return {
    x:
      ((cameraPoint.x * pose.zoom - pose.frustum.left) / frustumWidth) *
      viewport.width,
    y:
      ((pose.frustum.top - cameraPoint.y * pose.zoom) / frustumHeight) *
      viewport.height,
  };
}

/**
 * Projects a CSS-pixel pointer through the active camera onto a horizontal
 * world plane. Field rendering and touch aiming therefore use the same camera
 * instead of maintaining a second hand-tuned screen conversion.
 */
export function screenPointToWorldPlane(
  point: { x: number; y: number },
  camera: THREE.Camera,
  viewport: FieldViewport,
  worldHeight: number,
) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("viewport dimensions must be greater than zero.");
  }
  const pointer = new THREE.Vector2(
    (point.x / viewport.width) * 2 - 1,
    -(point.y / viewport.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -worldHeight),
    new THREE.Vector3(),
  );
}
