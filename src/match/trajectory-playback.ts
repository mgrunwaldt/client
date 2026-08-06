import type {
  BackendDecisionResult,
  BackendFlightPoint,
} from "./api-v1/contract";

export type AuthoritativeTrajectoryPlayback = {
  finalPoint: BackendFlightPoint;
  path: BackendFlightPoint[];
};

export function authoritativeTrajectoryPlayback(
  result: BackendDecisionResult | null | undefined,
): AuthoritativeTrajectoryPlayback | null {
  if (!result?.flight_path || !result.final_point) {
    return null;
  }

  const automaticShot = result.automatic_follow_up;
  if (!automaticShot) {
    return {
      path: result.flight_path,
      finalPoint: result.final_point,
    };
  }

  const incomingEndTime =
    result.flight_path[result.flight_path.length - 1]?.t ?? 0;
  const automaticPath = automaticShot.flight_path.map((point) => ({
    ...point,
    t: incomingEndTime + point.t,
  }));

  return {
    path: [...result.flight_path, ...automaticPath],
    finalPoint: {
      ...automaticShot.final_point,
      t: incomingEndTime + automaticShot.final_point.t,
    },
  };
}

export function completeAuthoritativeFlightPath(
  result: BackendDecisionResult | null | undefined,
) {
  return authoritativeTrajectoryPlayback(result)?.path ?? [];
}
