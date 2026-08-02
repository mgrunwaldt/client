import { z } from "zod";

export const MATCH_API_MAJOR_VERSION = "1";

export const KNOWN_MATCH_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_DECISION",
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

export interface BackendFieldPlayer {
  id: string;
  role: string;
  x: number;
  y: number;
  is_legend?: boolean;
  has_ball?: boolean;
  facing_target_x?: number;
  facing_target_y?: number;
  [key: string]: unknown;
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
    [key: string]: unknown;
  }>;
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
  flight_path?: BackendFlightPoint[];
  flight_outcome?: string;
  final_point?: BackendFlightPoint;
  receiver?: BackendFieldPlayer;
  interceptor?: BackendFieldPlayer;
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface BackendMatchSnapshot {
  match: BackendMatch;
  my_team: BackendTeam;
  opponent_team: BackendTeam;
  timeline: BackendTimelineEvent[];
  pending_action: BackendPendingAction | null;
  field_state: BackendFieldState | null;
  [key: string]: unknown;
}

const identifier = z.string().trim().min(1).max(128);
const coordinate = z.number().finite().min(0).max(100);
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
  })
  .passthrough();

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
    context: z.record(z.string(), z.unknown()),
    origin: z
      .object({
        previous_action_id: identifier,
        previous_outcome: z.string().trim().min(1),
      })
      .passthrough()
      .nullable(),
    contract_version: z.literal(2),
  })
  .passthrough();

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
  })
  .passthrough();

export const BackendMatchResponseSchema: z.ZodType<BackendMatchResponse> = z
  .object({
    minute: z.number().int().min(0).max(90),
    status: z.string().trim().min(1),
    prev_time: z.number().int().min(0).max(90),
    pending_action: BackendPendingActionSchema.nullable(),
    field_state: BackendFieldStateSchema.nullable(),
    action: z.string().trim().min(1).nullable(),
    action_team: actionTeam.nullable(),
    events: z.array(BackendTimelineEventSchema),
    match: BackendMatchSchema,
    decision_result: BackendDecisionResultSchema.optional(),
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

    const pendingAction = response.pending_action;
    const matchPendingAction = response.match.pending_action;
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
  });

export const BackendMatchSnapshotSchema: z.ZodType<BackendMatchSnapshot> = z
  .object({
    match: BackendMatchSchema,
    my_team: BackendTeamSchema,
    opponent_team: BackendTeamSchema,
    timeline: z.array(BackendTimelineEventSchema),
    pending_action: BackendPendingActionSchema.nullable(),
    field_state: BackendFieldStateSchema.nullable(),
  })
  .passthrough()
  .superRefine((response, context) => {
    const pendingAction = response.pending_action;
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
  .passthrough();

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
