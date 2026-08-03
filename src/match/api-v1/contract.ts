import { z } from "zod";

import {
  type KickControlEnvelope,
  KickControlEnvelopeSchema,
} from "../kick-input";

export const MATCH_API_MAJOR_VERSION = "1";

export const KNOWN_MATCH_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_DECISION",
  "WAITING_FOR_RECOVERY",
  "HALFTIME",
  "FINISHED",
] as const;

export const KNOWN_PLAYABLE_SCENES = [
  "OPEN_PLAY",
  "DRIBBLE",
  "FREE_KICK",
  "CORNER",
  "PENALTY",
  "JUMPER",
  "BRAWL",
  "ARGUMENT_OPPONENT",
  "ARGUMENT_TEAMMATE",
  "BATHROOM",
] as const;

export type KnownMatchStatus = (typeof KNOWN_MATCH_STATUSES)[number];
export type KnownPlayableScene = (typeof KNOWN_PLAYABLE_SCENES)[number];
export type BackendActionTeam = "MY_TEAM" | "OPPONENT_TEAM" | "NEUTRAL";

export interface BackendTeam {
  id: string;
  name: string;
  offense: number;
  defense: number;
  intensity: number;
  set_pieces?: number;
  chemistry?: number;
  formation?: string;
  [key: string]: unknown;
}

export interface BackendLegendProfile {
  stamina: number;
  energy: number;
  shoot: number;
  dribble: number;
  speed: number;
  passing: number;
  heading: number;
  defense: number;
  intelligence: number;
  yellow_cards?: number;
  red_card?: boolean;
  simulation_attempts?: number;
  substitutions?: number;
  [key: string]: unknown;
}

export interface BackendFieldPlayer {
  id: string;
  role: string;
  x: number;
  y: number;
  is_legend?: boolean;
  has_ball?: boolean;
  facing_target_x?: number;
  facing_target_y?: number;
  facing_target_player_id?: string | null;
  carry_offset_m?: number;
  [key: string]: unknown;
}

export interface BackendReceiverControl {
  carrier_player_id: string;
  facing_target_x: number;
  facing_target_y: number;
  facing_target_player_id: string | null;
  carry_offset_m: number;
}

export interface BackendFlightPoint {
  x: number;
  y: number;
  z: number;
  t: number;
  [key: string]: unknown;
}

export interface BackendFieldState {
  id: string;
  match_id: string;
  minute: number;
  action_type: string;
  scene_family: string;
  my_team_positions: BackendFieldPlayer[];
  opponent_positions: BackendFieldPlayer[];
  legend_player_id?: string | null;
  carrier_player_id?: string | null;
  distance_to_goal: number;
  ball_x: number;
  ball_y: number;
  facing_target_x?: number;
  facing_target_y?: number;
  facing_target_player_id?: string | null;
  carry_offset_m?: number;
  context?: Record<string, unknown>;
  dribble_pattern?: unknown;
  [key: string]: unknown;
}

export interface BackendPendingAction {
  id: string;
  minute: number;
  action_type: string;
  scene_type: string;
  action_team: BackendActionTeam;
  source: string;
  title: string;
  description: string;
  field_state_id: string;
  field_state?: BackendFieldState;
  available_choices: Array<{
    id: string;
    label: string;
    description: string;
    input_schema?: unknown;
    [key: string]: unknown;
  }>;
  control_envelope?: KickControlEnvelope;
  context?: Record<string, unknown>;
  contract_version: number;
  [key: string]: unknown;
}

export interface BackendMatch {
  id: string;
  my_team_id: string;
  opponent_team_id: string;
  my_team_score: number;
  opponent_team_score: number;
  current_time: number;
  prev_time: number;
  revision: number;
  match_status: string;
  pending_action: BackendPendingAction | null;
  legend_profile?: BackendLegendProfile;
  legend_player_id?: string;
  player_participation?: string;
  [key: string]: unknown;
}

export interface BackendTimelineEvent {
  match_id: string;
  event_id: number;
  action: string;
  minute: number;
  team: BackendActionTeam;
  description: string;
  my_team_score: number;
  opponent_team_score: number;
  my_team_scored: boolean;
  opponent_team_scored: boolean;
  player_participates: boolean;
  [key: string]: unknown;
}

export interface BackendDecisionResult {
  description: string;
  success: boolean;
  outcome_type: string;
  immediate_effects?: BackendImmediateEffects;
  pending_settlement_events?: BackendPendingSettlementEvent[];
  yellow_card?: boolean;
  red_card?: boolean;
  injured?: boolean;
  substituted?: boolean;
  my_team_scored?: boolean;
  opponent_team_scored?: boolean;
  flight_path?: BackendFlightPoint[];
  flight_outcome?: string;
  final_point?: BackendFlightPoint;
  receiver?: BackendFieldPlayer;
  interceptor?: BackendFieldPlayer;
  receiver_control?: BackendReceiverControl;
  [key: string]: unknown;
}

export interface BackendImmediateEffects {
  energy_delta?: number;
  yellow_cards?: number;
  red_card?: boolean;
  injured?: boolean;
  substituted?: boolean;
  my_team_score_delta?: number;
  opponent_score_delta?: number;
  my_team_momentum_delta?: number;
  opponent_momentum_delta?: number;
  opponent_yellow_cards?: number;
  opponent_red_cards?: number;
  follow_up_scene?: string;
  abandoned_by?: string;
  [key: string]: unknown;
}

export interface BackendPendingSettlementEvent {
  version: 1;
  id: string;
  match_id: string;
  category: "SOCIAL" | "CAREER" | "SEASON" | "ECONOMY";
  type: string;
  source: {
    match_id: string;
    action_id: string;
    action_sequence: number;
    settlement_sequence: number;
    scene_type: string;
    choice: string;
  };
  payload: Record<string, unknown>;
  created_revision: number;
  created_time: {
    match_minute: number;
    decision_sequence: number;
  };
  status: "PENDING";
}

export interface BackendUnsupportedSceneRecovery {
  version: 1;
  status: "RECOVERY_REQUIRED";
  code: "UNSUPPORTED_SCENE_TYPE";
  scene_type: string;
  action_id: string;
  action_sequence: number;
  minute: number;
  recovery: {
    choice: "CONTINUE_WITHOUT_EVENT";
    label: string;
    description: string;
    input_schema: {
      type: "object";
      required: ["choice"];
      allowed: ["choice"];
      additional_properties: false;
    };
  };
}

export interface BackendMatchResponse {
  minute: number;
  status: string;
  prev_time: number;
  pending_action: BackendPendingAction | null;
  field_state: BackendFieldState | null;
  action: string | null;
  action_team: BackendActionTeam | null;
  events: BackendTimelineEvent[];
  match: BackendMatch;
  decision_result?: BackendDecisionResult;
  pending_settlement_events: BackendPendingSettlementEvent[];
  unsupported_scene: BackendUnsupportedSceneRecovery | null;
  [key: string]: unknown;
}

export interface BackendMatchSnapshot {
  match: BackendMatch;
  my_team: BackendTeam;
  opponent_team: BackendTeam;
  timeline: BackendTimelineEvent[];
  pending_action: BackendPendingAction | null;
  field_state: BackendFieldState | null;
  pending_settlement_events: BackendPendingSettlementEvent[];
  unsupported_scene: BackendUnsupportedSceneRecovery | null;
  [key: string]: unknown;
}

const identifier = z.string().trim().min(1).max(128);
const coordinate = z.number().finite().min(0).max(100);
const rating = z.number().finite().min(0).max(100);
const actionTeam = z.enum(["MY_TEAM", "OPPONENT_TEAM", "NEUTRAL"]);

export const BackendTeamSchema: z.ZodType<BackendTeam> = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(120),
    offense: z.number().finite().min(0).max(100),
    defense: z.number().finite().min(0).max(100),
    intensity: z.number().finite().min(0).max(100),
    set_pieces: z.number().finite().min(0).max(100).optional(),
    chemistry: z.number().finite().min(0).max(100).optional(),
    formation: z.string().min(1).optional(),
  })
  .passthrough();

export const BackendLegendProfileSchema: z.ZodType<BackendLegendProfile> = z
  .object({
    stamina: rating,
    energy: rating,
    shoot: rating,
    dribble: rating,
    speed: rating,
    passing: rating,
    heading: rating,
    defense: rating,
    intelligence: rating,
    yellow_cards: z.number().int().min(0).max(2).optional(),
    red_card: z.boolean().optional(),
    simulation_attempts: z.number().int().min(0).optional(),
    substitutions: z.number().int().min(0).optional(),
  })
  .passthrough();

export const BackendFieldPlayerSchema: z.ZodType<BackendFieldPlayer> = z
  .object({
    id: identifier,
    role: z.string().trim().min(1),
    x: coordinate,
    y: coordinate,
    is_legend: z.boolean().optional(),
    has_ball: z.boolean().optional(),
    facing_target_x: coordinate.optional(),
    facing_target_y: coordinate.optional(),
    facing_target_player_id: identifier.nullable().optional(),
    carry_offset_m: z.number().finite().min(0).max(2).optional(),
  })
  .passthrough();

export const BackendReceiverControlSchema: z.ZodType<BackendReceiverControl> = z
  .object({
    carrier_player_id: identifier,
    facing_target_x: coordinate,
    facing_target_y: coordinate,
    facing_target_player_id: identifier.nullable(),
    carry_offset_m: z.number().finite().min(0).max(2),
  })
  .strict();

export const BackendFlightPointSchema: z.ZodType<BackendFlightPoint> = z
  .object({
    x: coordinate,
    y: coordinate,
    z: z.number().finite().min(0),
    t: z.number().finite().min(0),
  })
  .passthrough();

export const BackendFieldStateSchema: z.ZodType<BackendFieldState> = z
  .object({
    id: identifier,
    match_id: identifier,
    minute: z.number().int().min(1).max(89),
    action_type: z.string().trim().min(1),
    scene_family: z.string().trim().min(1),
    my_team_positions: z.array(BackendFieldPlayerSchema).min(1),
    opponent_positions: z.array(BackendFieldPlayerSchema).min(1),
    legend_player_id: identifier,
    carrier_player_id: identifier,
    distance_to_goal: z.number().finite().min(0).max(100),
    ball_x: coordinate,
    ball_y: coordinate,
    facing_target_x: coordinate.optional(),
    facing_target_y: coordinate.optional(),
    facing_target_player_id: identifier.nullable().optional(),
    carry_offset_m: z.number().finite().min(0).max(2).optional(),
    context: z.record(z.string(), z.unknown()),
    dribble_pattern: z.unknown().optional(),
  })
  .passthrough();

export const BackendPendingActionSchema: z.ZodType<BackendPendingAction> = z
  .object({
    id: identifier,
    minute: z.number().int().min(1).max(89),
    action_type: z.string().trim().min(1),
    scene_type: z.string().trim().min(1),
    action_team: actionTeam,
    source: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string(),
    field_state_id: identifier,
    field_state: BackendFieldStateSchema.optional(),
    available_choices: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            label: z.string(),
            description: z.string(),
          })
          .passthrough(),
      )
      .min(1),
    control_envelope: KickControlEnvelopeSchema.optional(),
    context: z.record(z.string(), z.unknown()),
    origin: z
      .object({
        previous_action_id: identifier,
        previous_outcome: z.string().trim().min(1),
      })
      .passthrough()
      .nullable(),
    contract_version: z.union([z.literal(2), z.literal(3)]),
  })
  .passthrough()
  .superRefine((action, context) => {
    const usesRandomEventContract = [
      "JUMPER",
      "ARGUMENT_OPPONENT",
      "ARGUMENT_TEAMMATE",
      "BRAWL",
      "BATHROOM",
    ].includes(action.scene_type);
    const expectedVersion = usesRandomEventContract ? 3 : 2;
    if (action.contract_version !== expectedVersion) {
      context.addIssue({
        code: "custom",
        message: `${action.scene_type} requires pending-action contract version ${expectedVersion}.`,
        path: ["contract_version"],
      });
    }
  });

export const BackendMatchSchema: z.ZodType<BackendMatch> = z
  .object({
    id: identifier,
    my_team_id: identifier,
    opponent_team_id: identifier,
    my_team_score: z.number().int().min(0),
    opponent_team_score: z.number().int().min(0),
    current_time: z.number().int().min(0).max(90),
    prev_time: z.number().int().min(0).max(90),
    revision: z.number().int().min(0),
    // Unknown status values are syntactically valid API data. The state machine
    // turns them into a recoverable diagnostic instead of allowing a blank UI.
    match_status: z.string().trim().min(1),
    pending_action: BackendPendingActionSchema.nullable(),
    legend_profile: BackendLegendProfileSchema.optional(),
    legend_player_id: identifier.optional(),
    event_counter: z.number().int().min(0),
    seed: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/),
    engine_version: z.string().trim().min(1),
    ruleset_version: z.string().trim().min(1),
    initial_state: z.record(z.string(), z.unknown()),
    player_participation: z.string().trim().min(1).optional(),
  })
  .passthrough();

function requirePrematchLegendData(
  match: BackendMatch,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (match.match_status !== "NOT_STARTED") return;
  if (!match.legend_profile) {
    context.addIssue({
      code: "custom",
      message: "A pre-match snapshot requires an authoritative Legend profile.",
      path: [...path, "legend_profile"],
    });
  }
  if (!match.legend_player_id) {
    context.addIssue({
      code: "custom",
      message:
        "A pre-match snapshot requires an authoritative Legend player ID.",
      path: [...path, "legend_player_id"],
    });
  }
}

function requireMatchTeamIdentity(
  response: {
    match: BackendMatch;
    my_team: BackendTeam;
    opponent_team: BackendTeam;
  },
  context: z.RefinementCtx,
) {
  if (response.my_team.id !== response.match.my_team_id) {
    context.addIssue({
      code: "custom",
      message: "My team must match match.my_team_id.",
      path: ["my_team", "id"],
    });
  }
  if (response.opponent_team.id !== response.match.opponent_team_id) {
    context.addIssue({
      code: "custom",
      message: "Opponent team must match match.opponent_team_id.",
      path: ["opponent_team", "id"],
    });
  }
}

export const BackendTimelineEventSchema: z.ZodType<BackendTimelineEvent> = z
  .object({
    match_id: identifier,
    event_id: z.number().int().min(0),
    action: z.string().trim().min(1),
    minute: z.number().int().min(1).max(90),
    team: actionTeam,
    description: z.string(),
    my_team_score: z.number().int().min(0),
    opponent_team_score: z.number().int().min(0),
    my_team_scored: z.boolean(),
    opponent_team_scored: z.boolean(),
    player_participates: z.boolean(),
  })
  .passthrough();

const BackendPendingSettlementEventSchema: z.ZodType<BackendPendingSettlementEvent> =
  z
    .object({
      version: z.literal(1),
      id: identifier,
      match_id: identifier,
      category: z.enum(["SOCIAL", "CAREER", "SEASON", "ECONOMY"]),
      type: z.string().trim().min(1),
      source: z
        .object({
          match_id: identifier,
          action_id: identifier,
          action_sequence: z.number().int().min(1),
          settlement_sequence: z.number().int().min(1),
          scene_type: z.string().trim().min(1),
          choice: z.string().trim().min(1),
        })
        .strict(),
      payload: z.record(z.string(), z.unknown()),
      created_revision: z.number().int().min(1),
      created_time: z
        .object({
          match_minute: z.number().int().min(1).max(89),
          decision_sequence: z.number().int().min(1),
        })
        .strict(),
      status: z.literal("PENDING"),
    })
    .strict();

const RecoveryInputSchema = z
  .object({
    type: z.literal("object"),
    required: z.tuple([z.literal("choice")]),
    allowed: z.tuple([z.literal("choice")]),
    additional_properties: z.literal(false),
  })
  .strict();

export const BackendUnsupportedSceneRecoverySchema: z.ZodType<BackendUnsupportedSceneRecovery> =
  z
    .object({
      version: z.literal(1),
      status: z.literal("RECOVERY_REQUIRED"),
      code: z.literal("UNSUPPORTED_SCENE_TYPE"),
      scene_type: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u),
      action_id: identifier,
      action_sequence: z.number().int().min(1),
      minute: z.number().int().min(1).max(89),
      recovery: z
        .object({
          choice: z.literal("CONTINUE_WITHOUT_EVENT"),
          label: z.string().trim().min(1).max(120),
          description: z.string().trim().min(1).max(256),
          input_schema: RecoveryInputSchema,
        })
        .strict(),
    })
    .strict();

export const BackendDecisionResultSchema: z.ZodType<BackendDecisionResult> = z
  .object({
    description: z.string(),
    success: z.boolean(),
    outcome_type: z.string().trim().min(1),
    flight_path: z.array(BackendFlightPointSchema).optional(),
    flight_outcome: z.string().trim().min(1).optional(),
    final_point: BackendFlightPointSchema.optional(),
    receiver: BackendFieldPlayerSchema.optional(),
    interceptor: BackendFieldPlayerSchema.optional(),
    receiver_control: BackendReceiverControlSchema.optional(),
    immediate_effects: z.record(z.string(), z.unknown()).optional(),
    pending_settlement_events: z
      .array(BackendPendingSettlementEventSchema)
      .optional(),
    unsupported_scene:
      BackendUnsupportedSceneRecoverySchema.nullable().optional(),
    yellow_card: z.boolean().optional(),
    red_card: z.boolean().optional(),
    injured: z.boolean().optional(),
    substituted: z.boolean().optional(),
    my_team_scored: z.boolean().optional(),
    opponent_team_scored: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((result, context) => {
    if (result.flight_outcome !== "TEAMMATE_CONTROL" && !result.receiver) {
      return;
    }
    if (!result.receiver) {
      context.addIssue({
        code: "custom",
        message: "Teammate control requires an authoritative receiver.",
        path: ["receiver"],
      });
    }
    if (!result.receiver_control) {
      context.addIssue({
        code: "custom",
        message: "Teammate control requires authoritative receiver control.",
        path: ["receiver_control"],
      });
      return;
    }
    if (
      result.receiver &&
      result.receiver.id !== result.receiver_control.carrier_player_id
    ) {
      context.addIssue({
        code: "custom",
        message: "Receiver control must identify the authoritative receiver.",
        path: ["receiver_control", "carrier_player_id"],
      });
    }
  });

export const BackendMatchResponseSchema: z.ZodType<BackendMatchResponse> = z
  .object({
    minute: z.number().int().min(1).max(90),
    status: z.string().trim().min(1),
    prev_time: z.number().int().min(0).max(90),
    pending_action: BackendPendingActionSchema.nullable(),
    field_state: BackendFieldStateSchema.nullable(),
    action: z.string().trim().min(1).nullable(),
    action_team: actionTeam.nullable(),
    events: z.array(BackendTimelineEventSchema),
    match: BackendMatchSchema,
    decision_result: BackendDecisionResultSchema.optional(),
    pending_settlement_events: z.array(BackendPendingSettlementEventSchema),
    unsupported_scene: BackendUnsupportedSceneRecoverySchema.nullable(),
  })
  .passthrough()
  .superRefine((response, context) => {
    if (response.status !== response.match.match_status) {
      context.addIssue({
        code: "custom",
        message: "Response status must match match.match_status.",
        path: ["status"],
      });
    }
    if (response.minute !== response.match.current_time) {
      context.addIssue({
        code: "custom",
        message: "Response minute must match the authoritative match.",
        path: ["minute"],
      });
    }

    const decisionResult = response.decision_result;
    const receiverControl = decisionResult?.receiver_control;
    const isPossessionHandoff =
      decisionResult?.flight_outcome === "TEAMMATE_CONTROL" &&
      decisionResult.success &&
      (decisionResult.outcome_type === "KICK_TO_OPEN_PLAY" ||
        decisionResult.outcome_type === "KICK_TO_BETTER_OPEN_PLAY");
    if (isPossessionHandoff && response.minute <= response.prev_time) {
      context.addIssue({
        code: "custom",
        message:
          "A possession continuation must advance beyond the action minute.",
        path: ["minute"],
      });
    }

    const pendingAction = response.pending_action;
    const matchPendingAction = response.match.pending_action;
    if (response.unsupported_scene) {
      if (
        response.status !== "WAITING_FOR_RECOVERY" ||
        pendingAction !== null ||
        matchPendingAction !== null ||
        response.field_state !== null
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Unsupported-scene recovery must hide playable action and field state.",
          path: ["unsupported_scene"],
        });
      }
    } else if (response.status === "WAITING_FOR_RECOVERY") {
      context.addIssue({
        code: "custom",
        message: "WAITING_FOR_RECOVERY requires unsupported_scene diagnostics.",
        path: ["unsupported_scene"],
      });
    }
    if (pendingAction?.id !== matchPendingAction?.id) {
      context.addIssue({
        code: "custom",
        message: "Response and match pending actions must agree.",
        path: ["pending_action"],
      });
    }
    if (!pendingAction) {
      if (response.field_state !== null) {
        context.addIssue({
          code: "custom",
          message: "A field state requires a pending action.",
          path: ["field_state"],
        });
      }
      if (isPossessionHandoff) {
        context.addIssue({
          code: "custom",
          message:
            "A successful teammate handoff requires an authoritative continuation.",
          path: ["pending_action"],
        });
      }
      return;
    }

    const embeddedField = pendingAction.field_state;
    const fieldState = embeddedField ?? response.field_state;
    if (!fieldState) {
      context.addIssue({
        code: "custom",
        message: "A pending action requires a field state.",
        path: ["field_state"],
      });
      return;
    }
    if (
      embeddedField &&
      response.field_state &&
      (response.field_state.id !== embeddedField.id ||
        response.field_state.match_id !== embeddedField.match_id ||
        response.field_state.minute !== embeddedField.minute ||
        response.field_state.action_type !== embeddedField.action_type)
    ) {
      context.addIssue({
        code: "custom",
        message: "Embedded and top-level field states must agree.",
        path: ["field_state"],
      });
    }
    if (
      fieldState.id !== pendingAction.field_state_id ||
      fieldState.match_id !== response.match.id ||
      fieldState.minute !== pendingAction.minute ||
      fieldState.action_type !== pendingAction.action_type
    ) {
      context.addIssue({
        code: "custom",
        message: "Pending action and field state identifiers must agree.",
        path: ["pending_action"],
      });
    }
    if (!isPossessionHandoff || !receiverControl) {
      return;
    }

    const carrier = fieldState.my_team_positions.find(
      (player) => player.id === receiverControl.carrier_player_id,
    );
    if (
      fieldState.carrier_player_id !== receiverControl.carrier_player_id ||
      !carrier
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The continuation field state must carry the authoritative receiver.",
        path: ["field_state", "carrier_player_id"],
      });
      return;
    }
    if (
      carrier.facing_target_x !== receiverControl.facing_target_x ||
      carrier.facing_target_y !== receiverControl.facing_target_y ||
      carrier.facing_target_player_id !==
        receiverControl.facing_target_player_id ||
      carrier.carry_offset_m !== receiverControl.carry_offset_m
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The continuation carrier must preserve authoritative receiver control.",
        path: ["field_state", "my_team_positions"],
      });
    }
    if (
      fieldState.facing_target_x !== receiverControl.facing_target_x ||
      fieldState.facing_target_y !== receiverControl.facing_target_y ||
      fieldState.facing_target_player_id !==
        receiverControl.facing_target_player_id ||
      fieldState.carry_offset_m !== receiverControl.carry_offset_m
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The continuation field state must expose authoritative receiver control.",
        path: ["field_state"],
      });
    }
  });

export const BackendMatchSnapshotSchema: z.ZodType<BackendMatchSnapshot> = z
  .object({
    match: BackendMatchSchema,
    my_team: BackendTeamSchema,
    opponent_team: BackendTeamSchema,
    timeline: z.array(BackendTimelineEventSchema),
    pending_action: BackendPendingActionSchema.nullable(),
    field_state: BackendFieldStateSchema.nullable(),
    pending_settlement_events: z.array(BackendPendingSettlementEventSchema),
    unsupported_scene: BackendUnsupportedSceneRecoverySchema.nullable(),
  })
  .strict()
  .superRefine((response, context) => {
    requireMatchTeamIdentity(response, context);
    requirePrematchLegendData(response.match, context, ["match"]);
    const pendingAction = response.pending_action;
    if (response.unsupported_scene) {
      if (
        response.match.match_status !== "WAITING_FOR_RECOVERY" ||
        pendingAction !== null ||
        response.match.pending_action !== null ||
        response.field_state !== null
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Unsupported-scene recovery must hide playable action and field state.",
          path: ["unsupported_scene"],
        });
      }
    } else if (response.match.match_status === "WAITING_FOR_RECOVERY") {
      context.addIssue({
        code: "custom",
        message: "WAITING_FOR_RECOVERY requires unsupported_scene diagnostics.",
        path: ["unsupported_scene"],
      });
    }
    if (pendingAction?.id !== response.match.pending_action?.id) {
      context.addIssue({
        code: "custom",
        message: "Snapshot and match pending actions must agree.",
        path: ["pending_action"],
      });
    }
    if (!pendingAction) {
      if (response.field_state !== null) {
        context.addIssue({
          code: "custom",
          message: "A snapshot field state requires a pending action.",
          path: ["field_state"],
        });
      }
      return;
    }

    const fieldState = pendingAction.field_state ?? response.field_state;
    if (!fieldState) {
      context.addIssue({
        code: "custom",
        message: "A snapshot pending action requires a field state.",
        path: ["field_state"],
      });
      return;
    }
    if (
      fieldState.id !== pendingAction.field_state_id ||
      fieldState.match_id !== response.match.id ||
      fieldState.minute !== pendingAction.minute ||
      fieldState.action_type !== pendingAction.action_type
    ) {
      context.addIssue({
        code: "custom",
        message: "Snapshot pending action and field state must agree.",
        path: ["pending_action"],
      });
    }
  });

export const BackendCreateMatchResponseSchema = z
  .object({
    id: identifier,
    match: BackendMatchSchema,
    my_team: BackendTeamSchema,
    opponent_team: BackendTeamSchema,
  })
  .passthrough()
  .superRefine((response, context) => {
    requireMatchTeamIdentity(response, context);
    requirePrematchLegendData(response.match, context, ["match"]);
  });

export const BackendTeamListResponseSchema = z
  .object({ teams: z.array(BackendTeamSchema) })
  .passthrough();

export const BackendErrorEnvelopeSchema = z
  .object({
    error: z.string().trim().min(1),
    code: z.string().trim().min(1).optional(),
    retryable: z.boolean().optional(),
  })
  .passthrough();

export function isKnownMatchStatus(status: string): status is KnownMatchStatus {
  return (KNOWN_MATCH_STATUSES as readonly string[]).includes(status);
}

export function isKnownPlayableScene(
  scene: string,
): scene is KnownPlayableScene {
  return (KNOWN_PLAYABLE_SCENES as readonly string[]).includes(scene);
}
