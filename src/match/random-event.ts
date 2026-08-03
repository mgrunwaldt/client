import type {
  BackendDecisionResult,
  BackendImmediateEffects,
  BackendPendingAction,
  BackendPendingSettlementEvent,
} from "./api-v1/contract";

export const RANDOM_EVENT_SCENES = [
  "JUMPER",
  "ARGUMENT_OPPONENT",
  "ARGUMENT_TEAMMATE",
  "BRAWL",
  "BATHROOM",
] as const;

export type RandomEventSceneType = (typeof RANDOM_EVENT_SCENES)[number];

export interface RandomEventChoice {
  id: string;
  label: string;
  description: string;
}

export interface ParsedRandomEvent {
  sceneType: RandomEventSceneType;
  choices: readonly RandomEventChoice[];
}

export interface RandomEventParseResult {
  event: ParsedRandomEvent | null;
  error: string | null;
}

export interface RandomEventEffect {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRandomEventSceneType(
  value: string,
): value is RandomEventSceneType {
  return RANDOM_EVENT_SCENES.includes(value as RandomEventSceneType);
}

function validateChoiceOnlyInputSchema(value: unknown) {
  if (!isRecord(value)) return false;
  const required = value.required;
  const allowed = value.allowed;
  return (
    Array.isArray(required) &&
    required.length === 1 &&
    required[0] === "choice" &&
    Array.isArray(allowed) &&
    allowed.length === 1 &&
    allowed[0] === "choice" &&
    value.additional_properties === false
  );
}

/**
 * The server supplies every player-facing choice and resolves its semantics.
 * Known scene types remain forward-compatible with additional valid choices.
 */
export function parseRandomEventAction(
  pendingAction: BackendPendingAction | null | undefined,
): RandomEventParseResult {
  if (!pendingAction || !isRandomEventSceneType(pendingAction.scene_type)) {
    return { event: null, error: null };
  }

  if (
    pendingAction.action_type !== pendingAction.scene_type ||
    pendingAction.action_team !== "NEUTRAL" ||
    pendingAction.contract_version !== 3
  ) {
    return {
      event: null,
      error:
        "This random event does not match the supported Match API v1 contract.",
    };
  }

  const choices = pendingAction.available_choices;
  const choiceIds = choices.map((choice) => choice.id);
  if (
    choiceIds.length === 0 ||
    choiceIds.some((choice) => !choice.trim()) ||
    new Set(choiceIds).size !== choiceIds.length
  ) {
    return {
      event: null,
      error: `The ${pendingAction.scene_type} event advertises an invalid choice set.`,
    };
  }

  for (const choice of choices) {
    if (
      !choice.label.trim() ||
      !choice.description.trim() ||
      !validateChoiceOnlyInputSchema(choice.input_schema)
    ) {
      return {
        event: null,
        error: `The ${pendingAction.scene_type} event contains an invalid choice contract.`,
      };
    }
  }

  return {
    event: {
      sceneType: pendingAction.scene_type,
      choices: choices.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    },
    error: null,
  };
}

export function isRandomEventAction(
  pendingAction: BackendPendingAction | null | undefined,
) {
  return Boolean(
    pendingAction && isRandomEventSceneType(pendingAction.scene_type),
  );
}

export function createRandomEventDecision(
  event: ParsedRandomEvent,
  choiceId: string,
) {
  if (!event.choices.some((choice) => choice.id === choiceId)) {
    throw new Error(
      `Choice ${choiceId} is not available for ${event.sceneType}.`,
    );
  }
  return { choice: choiceId };
}

export function createRandomEventSubmissionGate() {
  let submittedActionId: string | null = null;
  return {
    begin(actionId: string) {
      if (submittedActionId === actionId) return false;
      submittedActionId = actionId;
      return true;
    },
    reset(actionId: string) {
      if (submittedActionId === actionId) submittedActionId = null;
    },
  };
}

function signedValue(value: number, unit = "") {
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

function effect(
  label: string,
  value: string,
  tone: RandomEventEffect["tone"],
): RandomEventEffect {
  return { label, value, tone };
}

/** Renders only deltas and flags explicitly returned by the server. */
export function randomEventImmediateEffects(
  effects: BackendImmediateEffects | undefined,
  result: BackendDecisionResult | undefined,
): RandomEventEffect[] {
  const output: RandomEventEffect[] = [];
  if (!effects) return output;

  if (typeof effects.energy_delta === "number") {
    output.push(
      effect(
        "Energy",
        signedValue(effects.energy_delta),
        effects.energy_delta > 0 ? "positive" : "negative",
      ),
    );
  }
  if (typeof effects.yellow_cards === "number" && effects.yellow_cards > 0) {
    output.push(effect("Card", "Yellow card", "negative"));
  }
  if (effects.red_card === true || result?.red_card === true) {
    output.push(effect("Availability", "Sent off", "negative"));
  }
  if (effects.injured === true || result?.injured === true) {
    output.push(effect("Availability", "Injured", "negative"));
  }
  if (effects.substituted === true || result?.substituted === true) {
    output.push(effect("Availability", "Substituted", "neutral"));
  }
  if (typeof effects.my_team_score_delta === "number") {
    output.push(
      effect(
        "Score",
        `Your team ${signedValue(effects.my_team_score_delta)}`,
        effects.my_team_score_delta > 0 ? "positive" : "negative",
      ),
    );
  }
  if (typeof effects.opponent_score_delta === "number") {
    output.push(
      effect(
        "Score",
        `Opponent ${signedValue(effects.opponent_score_delta)}`,
        effects.opponent_score_delta > 0 ? "negative" : "positive",
      ),
    );
  }
  if (typeof effects.my_team_momentum_delta === "number") {
    output.push(
      effect(
        "Momentum",
        `Your team ${signedValue(effects.my_team_momentum_delta)}`,
        effects.my_team_momentum_delta > 0 ? "positive" : "negative",
      ),
    );
  }
  if (typeof effects.opponent_momentum_delta === "number") {
    output.push(
      effect(
        "Momentum",
        `Opponent ${signedValue(effects.opponent_momentum_delta)}`,
        effects.opponent_momentum_delta < 0 ? "positive" : "negative",
      ),
    );
  }
  if (
    typeof effects.opponent_yellow_cards === "number" &&
    effects.opponent_yellow_cards > 0
  ) {
    output.push(effect("Opponent", "Yellow card", "positive"));
  }
  if (
    typeof effects.opponent_red_cards === "number" &&
    effects.opponent_red_cards > 0
  ) {
    output.push(effect("Opponent", "Sent off", "positive"));
  }
  if (typeof effects.follow_up_scene === "string") {
    output.push(effect("Match flow", effects.follow_up_scene, "neutral"));
  }
  if (typeof effects.abandoned_by === "string") {
    output.push(effect("Match flow", "Match abandoned", "negative"));
  }

  return output;
}

function payloadSummary(payload: Record<string, unknown>) {
  return Object.entries(payload)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`)
    .join(" · ");
}

export function randomEventPendingSettlements(
  settlements: readonly BackendPendingSettlementEvent[] | undefined,
) {
  return (settlements ?? []).map((settlement) => ({
    id: settlement.id,
    label: `${settlement.category} · ${settlement.type.replace(/_/g, " ")}`,
    description: payloadSummary(settlement.payload),
  }));
}
