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

export function minDistanceToFieldPath(
  player: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
) {
  let best = Number.POSITIVE_INFINITY;
  const playerX = player.x * FIELD_WORLD_SCALE.x;
  const playerY = player.y * FIELD_WORLD_SCALE.z;

  path.forEach((point, index) => {
    if (index === 0) {
      best = Math.min(
        best,
        Math.hypot(
          playerX - point.x * FIELD_WORLD_SCALE.x,
          playerY - point.y * FIELD_WORLD_SCALE.z,
        ),
      );
      return;
    }
    const previous = path[index - 1];
    const startX = previous.x * FIELD_WORLD_SCALE.x;
    const startY = previous.y * FIELD_WORLD_SCALE.z;
    const dx = point.x * FIELD_WORLD_SCALE.x - startX;
    const dy = point.y * FIELD_WORLD_SCALE.z - startY;
    const lengthSquared = dx * dx + dy * dy;
    const ratio =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((playerX - startX) * dx + (playerY - startY) * dy) /
                lengthSquared,
            ),
          );
    best = Math.min(
      best,
      Math.hypot(
        playerX - (startX + dx * ratio),
        playerY - (startY + dy * ratio),
      ),
    );
  });

  return best;
}
