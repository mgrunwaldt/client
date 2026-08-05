import { FIELD_WORLD_SCALE } from "./field-transform";

export function normalizePlayerAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function rotationTowardsFieldTarget(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const deltaX = (target.x - source.x) * FIELD_WORLD_SCALE.x;
  const deltaZ = (target.y - source.y) * FIELD_WORLD_SCALE.z;
  return Math.atan2(deltaX, deltaZ);
}

export function advancePlayerRotation(
  current: number,
  target: number,
  deltaSeconds: number,
  turnSpeed: number,
) {
  const deltaAngle = normalizePlayerAngle(target - current);
  const step = Math.min(1, Math.max(0, deltaSeconds) * turnSpeed);
  return normalizePlayerAngle(current + deltaAngle * step);
}
