import type { BackendDecisionResult } from "./api-v1/contract";

export type KickFailurePresentationFamily =
  | "interception"
  | "missed-target"
  | "overhit";

export type KickFailurePresentation = {
  family: KickFailurePresentationFamily;
  holdMs: number;
  involvedPlayerId: string | null;
};

export function kickFailurePresentation(
  result: BackendDecisionResult | null | undefined,
): KickFailurePresentation | null {
  if (!result) return null;

  if (
    result.outcome_type === "OVERHIT_PASS" ||
    result.flight_outcome === "OVERHIT_TEAMMATE"
  ) {
    return {
      family: "overhit",
      holdMs: 900,
      involvedPlayerId: result.receiver?.id ?? null,
    };
  }

  if (
    result.outcome_type === "DEFENDER_INTERCEPT" ||
    result.flight_outcome === "DEFENDER_INTERCEPT"
  ) {
    return {
      family: "interception",
      holdMs: 800,
      involvedPlayerId: result.interceptor?.id ?? null,
    };
  }

  if (
    result.outcome_type === "KICK_OUT" ||
    result.flight_outcome === "OUT_OF_PLAY" ||
    result.flight_outcome === "MISS_HIGH" ||
    result.flight_outcome === "MISS_WIDE"
  ) {
    return {
      family: "missed-target",
      holdMs: 800,
      involvedPlayerId: null,
    };
  }

  return null;
}
