/**
 * The backend owns normalized field coordinates. This module is the single
 * affine transform used by scene geometry, DOM overlays, and camera framing.
 */

export const FIELD_WORLD_SCALE = {
  x: 0.68,
  z: 1.05,
} as const;

export const FIELD_GEOMETRY = {
  opponentGoalCenter: { x: 50, y: 0, z: 0 },
  opponentGoalPosts: [
    { x: 41.93, y: 0, z: 0 },
    { x: 58.07, y: 0, z: 0 },
  ],
  opponentPenaltyArea: {
    topLeft: { x: 20.35, y: 0, z: 0 },
    bottomRight: { x: 79.65, y: 15.71, z: 0 },
    penaltySpot: { x: 50, y: 10.48, z: 0 },
  },
} as const;

export type FieldPoint = {
  x: number;
  y: number;
  z?: number;
};

export type FieldPoint3d = {
  x: number;
  y: number;
  z: number;
};

/** Three.js axes: X is width, Y is height, Z is pitch length. */
export type WorldPoint = {
  x: number;
  y: number;
  z: number;
};

export type FieldAim = {
  x: number;
  y: number;
};

/** CSS pixel x/y plus the authoritative height carried alongside the label. */
export type ScreenPoint = {
  x: number;
  y: number;
  z: number;
};

export type FieldViewport = {
  width: number;
  height: number;
};

export type FieldViewWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FieldTransformOptions = {
  viewport: FieldViewport;
  view: FieldViewWindow;
};

export const FIXED_ATTACKING_VIEW: Readonly<FieldViewWindow> = {
  left: 0,
  top: -6,
  width: 100,
  height: 50,
};

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function normalizedPoint(point: FieldPoint): FieldPoint3d {
  requireFinite(point.x, "field.x");
  requireFinite(point.y, "field.y");
  requireFinite(point.z ?? 0, "field.z");
  return { x: point.x, y: point.y, z: point.z ?? 0 };
}

function validateViewport(viewport: FieldViewport) {
  requireFinite(viewport.width, "viewport.width");
  requireFinite(viewport.height, "viewport.height");
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("viewport dimensions must be greater than zero.");
  }
}

function validateView(view: FieldViewWindow) {
  requireFinite(view.left, "view.left");
  requireFinite(view.top, "view.top");
  requireFinite(view.width, "view.width");
  requireFinite(view.height, "view.height");
  if (view.width <= 0 || view.height <= 0) {
    throw new RangeError("view dimensions must be greater than zero.");
  }
}

/**
 * Keeps the Legend at horizontal center and 20% from the bottom. Do not clamp
 * this window: the renderer must preserve stadium overscan at field edges.
 */
export function followLegendView(legend: FieldPoint): FieldViewWindow {
  const point = normalizedPoint(legend);
  return {
    left: point.x - 50,
    top: point.y - 40,
    width: 100,
    height: 50,
  };
}

export function fixedAttackingView(): FieldViewWindow {
  return { ...FIXED_ATTACKING_VIEW };
}

/**
 * Converts a direction drawn on the rendered pitch into the unit vector used
 * by the backend's normalized 68x105 field coordinates. The renderer's X/Z
 * axes are already scaled to physical metres, so normalizing them directly
 * would apply the pitch aspect ratio twice in the authoritative simulation.
 */
export function worldVectorToFieldAim(vector: {
  x: number;
  z: number;
}): FieldAim | null {
  requireFinite(vector.x, "worldVector.x");
  requireFinite(vector.z, "worldVector.z");
  const fieldX = vector.x / FIELD_WORLD_SCALE.x;
  const fieldY = vector.z / FIELD_WORLD_SCALE.z;
  const magnitude = Math.hypot(fieldX, fieldY);
  if (magnitude === 0) return null;
  return { x: fieldX / magnitude, y: fieldY / magnitude };
}

/**
 * Creates one immutable coordinate projection for a render sequence. The view
 * is intentionally supplied by authoritative sequence framing and is never
 * clamped or shifted by this client-side transform.
 */
export function createFieldTransform({
  viewport,
  view,
}: FieldTransformOptions) {
  validateViewport(viewport);
  validateView(view);

  const fieldToWorld = (point: FieldPoint): WorldPoint => {
    const field = normalizedPoint(point);
    return {
      x: (field.x - 50) * FIELD_WORLD_SCALE.x,
      y: field.z,
      z: (field.y - 50) * FIELD_WORLD_SCALE.z,
    };
  };

  const worldToField = (point: WorldPoint): FieldPoint3d => {
    requireFinite(point.x, "world.x");
    requireFinite(point.y, "world.y");
    requireFinite(point.z, "world.z");
    return {
      x: point.x / FIELD_WORLD_SCALE.x + 50,
      y: point.z / FIELD_WORLD_SCALE.z + 50,
      z: point.y,
    };
  };

  const fieldToScreen = (point: FieldPoint): ScreenPoint => {
    const field = normalizedPoint(point);
    return {
      x: ((field.x - view.left) / view.width) * viewport.width,
      y: ((field.y - view.top) / view.height) * viewport.height,
      z: field.z,
    };
  };

  const screenToField = (point: ScreenPoint): FieldPoint3d => {
    requireFinite(point.x, "screen.x");
    requireFinite(point.y, "screen.y");
    requireFinite(point.z, "screen.z");
    return {
      x: view.left + (point.x / viewport.width) * view.width,
      y: view.top + (point.y / viewport.height) * view.height,
      z: point.z,
    };
  };

  const worldToScreen = (point: WorldPoint): ScreenPoint =>
    fieldToScreen(worldToField(point));

  const screenToWorld = (point: ScreenPoint): WorldPoint =>
    fieldToWorld(screenToField(point));

  return {
    viewport: { ...viewport },
    view: { ...view },
    cameraCenter: fieldToWorld({
      x: view.left + view.width / 2,
      y: view.top + view.height / 2,
      z: 0,
    }),
    fieldToWorld,
    worldToField,
    fieldToScreen,
    screenToField,
    worldToScreen,
    screenToWorld,
  } as const;
}
