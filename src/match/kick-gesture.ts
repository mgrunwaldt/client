export const AIM_MIN_DISTANCE = 0.05;
export const AIM_POWER_NORMALIZATION_DISTANCE = 32;

export interface BallAimDraft {
  dragStart: { x: number; y: number; z: number };
  dragCurrent: { x: number; y: number; z: number };
  shotVector: { x: number; y: number; z: number };
  normalizedDirection: { x: number; y: number; z: number };
  pullDistance: number;
  normalizedPower: number;
}

export function buildBallAimDraft(
  start: { x: number; y: number; z: number },
  current: { x: number; y: number; z: number },
): BallAimDraft | null {
  const shotVector = {
    x: start.x - current.x,
    y: start.y - current.y,
    z: start.z - current.z,
  };
  const pullDistance = Math.hypot(shotVector.x, shotVector.y, shotVector.z);
  if (pullDistance < AIM_MIN_DISTANCE) return null;

  return {
    dragStart: start,
    dragCurrent: current,
    shotVector,
    normalizedDirection: {
      x: shotVector.x / pullDistance,
      y: shotVector.y / pullDistance,
      z: shotVector.z / pullDistance,
    },
    pullDistance,
    normalizedPower: Math.min(
      1,
      pullDistance / AIM_POWER_NORMALIZATION_DISTANCE,
    ),
  };
}
