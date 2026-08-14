import type { BackendDecisionResult } from "./api-v1/contract";

export type AutomaticFinishOutcome = "blocked" | "goal" | "missed" | "saved";

export type AutomaticFinishPresentation = {
  actorPlayerId: string;
  contactPlayerId: string | null;
  outcome: AutomaticFinishOutcome;
  responseHoldMs: number;
};

const OUTCOMES: Record<string, AutomaticFinishOutcome> = {
  AUTOMATIC_TEAMMATE_BLOCKED: "blocked",
  AUTOMATIC_TEAMMATE_GOAL: "goal",
  AUTOMATIC_TEAMMATE_MISSED: "missed",
  AUTOMATIC_TEAMMATE_SAVED: "saved",
};

export function automaticFinishPresentation(
  result: BackendDecisionResult | null | undefined,
): AutomaticFinishPresentation | null {
  const followUp = result?.automatic_follow_up;
  const outcome = result ? OUTCOMES[result.outcome_type] : undefined;
  if (!followUp || !outcome) return null;

  return {
    actorPlayerId: followUp.actor_player_id,
    contactPlayerId: followUp.contact?.player_id ?? null,
    outcome,
    responseHoldMs: 2_200,
  };
}
