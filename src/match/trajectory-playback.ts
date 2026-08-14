import type {
  BackendDecisionResult,
  BackendFlightPoint,
} from "./api-v1/contract";

export type AuthoritativeTrajectoryPlayback = {
  automaticStages: AutomaticTrajectoryStages | null;
  finalPoint: BackendFlightPoint;
  path: BackendFlightPoint[];
};

export type AutomaticTrajectoryStages = {
  incomingEndMs: number;
  shotEndMs: number;
  shotStartMs: number;
};

export const MIN_READABLE_FLIGHT_MS = 500;
export const AUTOMATIC_CONTROL_HOLD_MS = 650;

export function trajectoryPlaybackDurationMs(
  path: BackendFlightPoint[],
): number {
  if (path.length < 2) return 0;
  const sourceDurationMs = Math.max(
    0,
    ((path[path.length - 1]?.t ?? 0) - (path[0]?.t ?? 0)) * 1000,
  );
  return Math.max(MIN_READABLE_FLIGHT_MS, sourceDurationMs);
}

export function sampleAuthoritativeFlightPath(
  path: BackendFlightPoint[],
  elapsedMs: number,
  durationMs = trajectoryPlaybackDurationMs(path),
) {
  if (path.length === 0) return null;
  if (path.length === 1 || durationMs <= 0) {
    const point = path[path.length - 1];
    return { x: point.x, y: point.y, z: point.z };
  }

  const startTime = path[0].t;
  const endTime = path[path.length - 1].t;
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  if (progress >= 1) {
    const lastPoint = path[path.length - 1];
    return { x: lastPoint.x, y: lastPoint.y, z: lastPoint.z };
  }
  const sampleTime = startTime + (endTime - startTime) * progress;

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (sampleTime <= current.t) {
      const span = current.t - previous.t;
      const alpha =
        span <= 0
          ? 0
          : Math.max(0, Math.min(1, (sampleTime - previous.t) / span));
      return {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
        z: previous.z + (current.z - previous.z) * alpha,
      };
    }
  }

  const lastPoint = path[path.length - 1];
  return { x: lastPoint.x, y: lastPoint.y, z: lastPoint.z };
}

export function authoritativeTrajectoryPlayback(
  result: BackendDecisionResult | null | undefined,
): AuthoritativeTrajectoryPlayback | null {
  if (!result?.flight_path || !result.final_point) {
    return null;
  }

  const automaticShot = result.automatic_follow_up;
  if (!automaticShot) {
    return {
      automaticStages: null,
      path: result.flight_path,
      finalPoint: result.final_point,
    };
  }

  const incomingEndTime =
    result.flight_path[result.flight_path.length - 1]?.t ?? 0;
  const shotStartTime = incomingEndTime + AUTOMATIC_CONTROL_HOLD_MS / 1000;
  const automaticPath = automaticShot.flight_path.map((point) => ({
    ...point,
    t: shotStartTime + point.t,
  }));
  const shotEndTime = shotStartTime + automaticShot.final_point.t;

  return {
    automaticStages: {
      incomingEndMs: incomingEndTime * 1000,
      shotEndMs: shotEndTime * 1000,
      shotStartMs: shotStartTime * 1000,
    },
    path: [...result.flight_path, ...automaticPath],
    finalPoint: {
      ...automaticShot.final_point,
      t: shotEndTime,
    },
  };
}

export function completeAuthoritativeFlightPath(
  result: BackendDecisionResult | null | undefined,
) {
  return authoritativeTrajectoryPlayback(result)?.path ?? [];
}
