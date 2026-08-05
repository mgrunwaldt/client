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
export type BackendTeamSide = "MY_TEAM" | "OPPONENT_TEAM";
export type BackendLegendStatus =
  | "AVAILABLE"
  | "SUBSTITUTED"
  | "INJURED"
  | "EXPELLED";
export type BackendLegendAvailability = "AVAILABLE" | "UNAVAILABLE";
export type BackendPlayerParticipation =
  | "NOT_PARTICIPATING"
  | "PARTICIPATING"
  | "OBSERVING";
export type BackendTerminalResult = "WIN" | "DRAW" | "LOSS" | "NO_CONTEST";

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
  team_id?: string;
  team_side?: BackendTeamSide;
  role: string;
  x: number;
  y: number;
  is_legend?: boolean;
  has_ball?: boolean;
  facing_target_x?: number;
  facing_target_y?: number;
  facing_target_player_id?: string | null;
  carry_offset_m?: number;
  collision_shape?: BackendCollisionShape;
  [key: string]: unknown;
}

export interface BackendCollisionShape {
  radius_m: number;
  height_m: number;
  receive_radius_m: number;
}

export interface BackendFieldCoordinateSystem {
  version: "field-coordinate-system/1";
  x: {
    unit: "PERCENT_OF_PITCH_WIDTH";
    minimum: 0;
    maximum: 100;
    direction: "LEFT_TO_RIGHT";
  };
  y: {
    unit: "PERCENT_OF_PITCH_LENGTH";
    minimum: 0;
    maximum: 100;
    direction: "OPPONENT_GOAL_TO_OWN_GOAL";
  };
  z: {
    unit: "METRE";
    origin: "PITCH_PLANE";
    direction: "UP";
  };
  attacking_direction: "NEGATIVE_Y";
  world_transform: {
    version: "pitch-world-affine/1";
    unit: "METRE";
    world_x: {
      source_axis: "x";
      source_origin: 50;
      metres_per_unit: 0.68;
    };
    world_y: {
      source_axis: "z";
      source_origin: 0;
      metres_per_unit: 1;
    };
    world_z: {
      source_axis: "y";
      source_origin: 50;
      metres_per_unit: 1.05;
    };
  };
  anchors: {
    player_xy: "FEET_MIDPOINT";
    ball_xy: "GROUND_PROJECTION";
    ball_z: "BALL_CENTER";
    label_xy: "PLAYER_FEET_MIDPOINT";
  };
}

export interface BackendFieldSequence {
  version: 1;
  sequence_id: string;
  anchor_player_id: string;
  attacking_target: {
    type: "OPPONENT_GOAL_CENTER";
    x: 50;
    y: 0;
    goalkeeper_player_id: string | null;
  };
  camera: {
    policy_version: "attacking-top-down/1";
    projection: "ORTHOGRAPHIC_TOP_DOWN";
    locked: true;
    mode: "FIXED_ATTACKING_THIRD" | "CORNER_ATTACKING_THIRD" | "FOLLOW_LEGEND";
    view_window: {
      left: number;
      top: number;
      width: 100;
      height: 50;
    };
  };
}

export interface BackendFieldGeometry {
  version: "regulation-68x105-v1";
  pitch_width_m: 68;
  pitch_length_m: 105;
  goal_width_m: 7.32;
  goal_height_m: 2.44;
  goal_depth_m: 2;
  goal_post_radius_m: 0.06;
  ball_radius_m: 0.11;
  opponent_goal: {
    line_y: 0;
    left_post_x: 44.62;
    right_post_x: 55.38;
  };
  opponent_penalty_area: {
    min_x: 20.35;
    max_x: 79.65;
    min_y: 0;
    max_y: 15.71;
    penalty_spot: { x: 50; y: 10.48 };
  };
}

export interface BackendCurrentFieldPlayer extends BackendFieldPlayer {
  team_id: string;
  team_side: BackendTeamSide;
  collision_shape: BackendCollisionShape;
}

export interface BackendCurrentFieldContext {
  seed: number;
  distance_to_goal: number;
  side_of_pitch: "LEFT" | "CENTER" | "RIGHT";
  pressure: number;
  attack_phase: "SETTLED" | "TRANSITION" | "HALF_SPACE";
  numerical_advantage: number;
  quality_band: "SAFE" | "PROGRESSIVE" | "RISKY";
  previous_outcome: string | null;
  carrier_player_id: string;
  possession_state?: "PASS_RECEIVED" | "PENALTY_REBOUND";
  ball_x?: number;
  ball_y?: number;
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

export interface BackendKickContact {
  type: "PLAYER" | "GOALKEEPER" | "POST" | "CROSSBAR";
  player_id?: string;
  at: BackendFlightPoint;
  speed_mps?: number;
}

export interface BackendAutomaticKickFollowUp {
  type: "TEAMMATE_SHOT";
  actor_player_id: string;
  opportunity: {
    eligible: true;
    score: number;
    distance_to_goal_m: number;
    nearest_defender_m: number | null;
    lane_blocked: false;
    scene_pressure: number;
    receive_speed_mps: number;
  };
  flight_path: BackendFlightPoint[];
  flight_outcome: string;
  final_point: BackendFlightPoint;
  contact: BackendKickContact | null;
  frame_contacts: BackendKickContact[];
}

export interface BackendFieldState {
  id: string;
  action_sequence?: number;
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
  geometry?: BackendFieldGeometry;
  coordinate_system?: BackendFieldCoordinateSystem;
  sequence?: BackendFieldSequence;
  [key: string]: unknown;
}

export interface BackendCurrentFieldState extends BackendFieldState {
  action_sequence: number;
  my_team_positions: BackendCurrentFieldPlayer[];
  opponent_positions: BackendCurrentFieldPlayer[];
  legend_player_id: string;
  carrier_player_id: string;
  context: BackendCurrentFieldContext;
  coordinate_system: BackendFieldCoordinateSystem;
  sequence: BackendFieldSequence;
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
  player_participation?: BackendPlayerParticipation;
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
  automatic_follow_up?: BackendAutomaticKickFollowUp;
  unsupported_scene_recovery?: BackendUnsupportedSceneRecoveryResult;
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

export interface BackendMatchScore {
  my_team: number;
  opponent_team: number;
}

export interface BackendTeamStatisticLine {
  score: number;
  attacks: number;
  goals_in_play: number;
  yellow_cards: number;
  red_cards: number;
}

export interface BackendTeamStatistics {
  my_team: BackendTeamStatisticLine;
  opponent_team: BackendTeamStatisticLine;
}

export interface BackendLegendAvailabilityState {
  version: 1;
  status: BackendLegendStatus;
  availability: BackendLegendAvailability;
  participation: BackendPlayerParticipation;
  interactive_controls: boolean;
  unavailable_since_minute: number | null;
}

export interface BackendAdministrativeResult {
  version: 1;
  responsible_side: "MY_TEAM" | "OPPONENT_TEAM" | "BOTH";
  minute: number;
  score_before: BackendMatchScore;
  score_after: BackendMatchScore;
  disposition:
    | "ADMINISTRATIVE_0_3"
    | "RESULT_PRESERVED_WORSE"
    | "ABANDONED_NO_CONTEST";
  no_contest: boolean;
}

export interface BackendLegendContribution {
  version: 1;
  legend_player_id: string;
  status: BackendLegendStatus;
  availability: BackendLegendAvailability;
  minutes_played: number;
  interventions: number;
  completed_actions: number;
  successful_actions: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_card: boolean;
  injured: boolean;
  substituted: boolean;
  administrative_result?: BackendAdministrativeResult;
  energy_start: number;
  energy_current: number;
  stamina: number;
}

export interface BackendHalftimeRecovery {
  version: 1;
  config_version: "halftime-recovery/1";
  eligibility: "ELIGIBLE" | "INELIGIBLE_UNAVAILABLE";
  legend_status: BackendLegendStatus;
  stamina: number;
  energy_before: number;
  energy_recovered: number;
  energy_after: number;
  minimum_energy: 4;
  maximum_energy: 18;
}

export interface BackendHalftimeSummary {
  version: 1;
  match_id: string;
  minute: 45;
  score: BackendMatchScore;
  team_statistics: BackendTeamStatistics;
  legend_contribution: BackendLegendContribution;
  recovery: BackendHalftimeRecovery;
  continue_required: true;
  tactics_editable: false;
}

export interface BackendKeyMatchEvent {
  event_id: number;
  minute: number;
  action: string;
  team: BackendActionTeam;
  description: string;
  score: BackendMatchScore;
  outcome_type: string | null;
}

export interface BackendFullTimeHandoff {
  version: 2;
  match_id: string;
  status: "FULL_TIME" | "ABANDONED";
  terminal_reason: "REGULATION" | "ADMINISTRATIVE";
  final_score: BackendMatchScore;
  result: BackendTerminalResult;
  season_points_delta: -1 | 1 | 3 | null;
  key_events: BackendKeyMatchEvent[];
  team_statistics: BackendTeamStatistics;
  legend_contribution: BackendLegendContribution;
  pending_settlement_events: BackendPendingSettlementEvent[];
  administrative_result: BackendAdministrativeResult | null;
  settlement_status: "PENDING_HANDOFF";
}

export interface BackendUnsupportedSceneRecovery {
  version: 1;
  status: "RECOVERY_REQUIRED";
  code: "UNSUPPORTED_SCENE_TYPE" | "UNSUPPORTED_SCENE_VERSION";
  scene_type: string;
  contract_version: number | null;
  supported_contract_version: number | null;
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

export interface BackendOperationPlayback {
  version: 1;
  submitted_action: BackendPendingAction | null;
  submitted_field_state: BackendFieldState | null;
  last_decision: BackendLastDecision | null;
  decision_result: BackendDecisionResult | null;
  events: BackendTimelineEvent[];
}

export interface BackendLastDecision {
  id: string;
  match_id: string;
  sequence: number;
  minute: number;
  action: string;
  action_team: BackendActionTeam;
  action_id: string;
  action_version: number;
  decision_version: number;
  decision_data: Record<string, unknown>;
  field_state_id: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface BackendMatchOperationReceipt {
  version: 1;
  operation_id: string;
  operation:
    | "createMatch"
    | "startMatch"
    | "resumeMatch"
    | "abandonMatch"
    | "processMatchAction";
  status: "COMMITTED";
  request_revision: number | null;
  committed_revision: number;
  action_id: string | null;
  playback: BackendOperationPlayback | null;
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
  legend_availability: BackendLegendAvailabilityState;
  halftime_summary: BackendHalftimeSummary | null;
  full_time_handoff: BackendFullTimeHandoff | null;
  latest_operation?: BackendMatchOperationReceipt | null;
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
  legend_availability: BackendLegendAvailabilityState;
  halftime_summary: BackendHalftimeSummary | null;
  full_time_handoff: BackendFullTimeHandoff | null;
  latest_operation: BackendMatchOperationReceipt | null;
  [key: string]: unknown;
}

const identifier = z.string().trim().min(1).max(128);
const coordinate = z.number().finite().min(0).max(100);
const rating = z.number().finite().min(0).max(100);
const actionTeam = z.enum(["MY_TEAM", "OPPONENT_TEAM", "NEUTRAL"]);
const teamSide = z.enum(["MY_TEAM", "OPPONENT_TEAM"]);

export const BackendCollisionShapeSchema: z.ZodType<BackendCollisionShape> = z
  .object({
    radius_m: z.number().finite().min(0.3).max(0.9),
    height_m: z.number().finite().min(1.7).max(2.44),
    receive_radius_m: z.number().finite().min(0.3).max(0.9),
  })
  .strict();

export const BackendFieldCoordinateSystemSchema: z.ZodType<BackendFieldCoordinateSystem> =
  z
    .object({
      version: z.literal("field-coordinate-system/1"),
      x: z
        .object({
          unit: z.literal("PERCENT_OF_PITCH_WIDTH"),
          minimum: z.literal(0),
          maximum: z.literal(100),
          direction: z.literal("LEFT_TO_RIGHT"),
        })
        .strict(),
      y: z
        .object({
          unit: z.literal("PERCENT_OF_PITCH_LENGTH"),
          minimum: z.literal(0),
          maximum: z.literal(100),
          direction: z.literal("OPPONENT_GOAL_TO_OWN_GOAL"),
        })
        .strict(),
      z: z
        .object({
          unit: z.literal("METRE"),
          origin: z.literal("PITCH_PLANE"),
          direction: z.literal("UP"),
        })
        .strict(),
      attacking_direction: z.literal("NEGATIVE_Y"),
      world_transform: z
        .object({
          version: z.literal("pitch-world-affine/1"),
          unit: z.literal("METRE"),
          world_x: z
            .object({
              source_axis: z.literal("x"),
              source_origin: z.literal(50),
              metres_per_unit: z.literal(0.68),
            })
            .strict(),
          world_y: z
            .object({
              source_axis: z.literal("z"),
              source_origin: z.literal(0),
              metres_per_unit: z.literal(1),
            })
            .strict(),
          world_z: z
            .object({
              source_axis: z.literal("y"),
              source_origin: z.literal(50),
              metres_per_unit: z.literal(1.05),
            })
            .strict(),
        })
        .strict(),
      anchors: z
        .object({
          player_xy: z.literal("FEET_MIDPOINT"),
          ball_xy: z.literal("GROUND_PROJECTION"),
          ball_z: z.literal("BALL_CENTER"),
          label_xy: z.literal("PLAYER_FEET_MIDPOINT"),
        })
        .strict(),
    })
    .strict();

export const BackendFieldSequenceSchema: z.ZodType<BackendFieldSequence> = z
  .object({
    version: z.literal(1),
    sequence_id: identifier,
    anchor_player_id: identifier,
    attacking_target: z
      .object({
        type: z.literal("OPPONENT_GOAL_CENTER"),
        x: z.literal(50),
        y: z.literal(0),
        goalkeeper_player_id: identifier.nullable(),
      })
      .strict(),
    camera: z
      .object({
        policy_version: z.literal("attacking-top-down/1"),
        projection: z.literal("ORTHOGRAPHIC_TOP_DOWN"),
        locked: z.literal(true),
        mode: z.enum([
          "FIXED_ATTACKING_THIRD",
          "CORNER_ATTACKING_THIRD",
          "FOLLOW_LEGEND",
        ]),
        view_window: z
          .object({
            left: z.number().finite().min(-50).max(50),
            top: z.number().finite().min(-40).max(60),
            width: z.literal(100),
            height: z.literal(50),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const BackendFieldGeometrySchema: z.ZodType<BackendFieldGeometry> = z
  .object({
    version: z.literal("regulation-68x105-v1"),
    pitch_width_m: z.literal(68),
    pitch_length_m: z.literal(105),
    goal_width_m: z.literal(7.32),
    goal_height_m: z.literal(2.44),
    goal_depth_m: z.literal(2),
    goal_post_radius_m: z.literal(0.06),
    ball_radius_m: z.literal(0.11),
    opponent_goal: z
      .object({
        line_y: z.literal(0),
        left_post_x: z.literal(44.62),
        right_post_x: z.literal(55.38),
      })
      .strict(),
    opponent_penalty_area: z
      .object({
        min_x: z.literal(20.35),
        max_x: z.literal(79.65),
        min_y: z.literal(0),
        max_y: z.literal(15.71),
        penalty_spot: z
          .object({ x: z.literal(50), y: z.literal(10.48) })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const BackendCurrentFieldContextSchema: z.ZodType<BackendCurrentFieldContext> =
  z
    .object({
      seed: z.number().finite(),
      distance_to_goal: z.number().finite().min(0).max(100),
      side_of_pitch: z.enum(["LEFT", "CENTER", "RIGHT"]),
      pressure: rating,
      attack_phase: z.enum(["SETTLED", "TRANSITION", "HALF_SPACE"]),
      numerical_advantage: z.number().int().min(-2).max(2),
      quality_band: z.enum(["SAFE", "PROGRESSIVE", "RISKY"]),
      previous_outcome: z.string().nullable(),
      carrier_player_id: identifier,
      possession_state: z.enum(["PASS_RECEIVED", "PENALTY_REBOUND"]).optional(),
      ball_x: coordinate.optional(),
      ball_y: coordinate.optional(),
      facing_target_x: coordinate.optional(),
      facing_target_y: coordinate.optional(),
      facing_target_player_id: identifier.nullable().optional(),
      carry_offset_m: z.number().finite().min(0).max(2).optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.possession_state !== "PASS_RECEIVED") return;
      for (const key of [
        "ball_x",
        "ball_y",
        "facing_target_x",
        "facing_target_y",
        "facing_target_player_id",
        "carry_offset_m",
      ] as const) {
        if (value[key] === undefined) {
          context.addIssue({
            code: "custom",
            message: `PASS_RECEIVED requires ${key}.`,
            path: [key],
          });
        }
      }
    });

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
    team_id: identifier.optional(),
    team_side: teamSide.optional(),
    role: z.string().trim().min(1),
    x: coordinate,
    y: coordinate,
    is_legend: z.boolean().optional(),
    has_ball: z.boolean().optional(),
    facing_target_x: coordinate.optional(),
    facing_target_y: coordinate.optional(),
    facing_target_player_id: identifier.nullable().optional(),
    carry_offset_m: z.number().finite().min(0).max(2).optional(),
    collision_shape: BackendCollisionShapeSchema.optional(),
  })
  .passthrough();

export const BackendCurrentFieldPlayerSchema: z.ZodType<BackendCurrentFieldPlayer> =
  z
    .object({
      id: identifier,
      team_id: identifier,
      team_side: teamSide,
      side: teamSide.optional(),
      role: z.string().trim().min(1),
      x: coordinate,
      y: coordinate,
      is_legend: z.boolean().optional(),
      has_ball: z.boolean().optional(),
      facing_target_x: coordinate.optional(),
      facing_target_y: coordinate.optional(),
      facing_target_player_id: identifier.nullable().optional(),
      carry_offset_m: z.number().finite().min(0).max(2).optional(),
      collision_shape: BackendCollisionShapeSchema,
    })
    .strict();

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
    // The trajectory uses the field state's normalized x/y axes but may cross
    // a boundary before the full ball exits. z remains metric ball-center height.
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite().min(0.11),
    t: z.number().finite().min(0).max(6),
  })
  .strict();

function validateFlightTrajectory(
  flightPath: BackendFlightPoint[],
  finalPoint: BackendFlightPoint,
  context: z.RefinementCtx,
  flightPathPrefix: (string | number)[] = ["flight_path"],
  finalPointPrefix: (string | number)[] = ["final_point"],
) {
  if (flightPath[0]?.t !== 0) {
    context.addIssue({
      code: "custom",
      message: "Trajectory playback must start at contact time t=0.",
      path: [...flightPathPrefix, 0, "t"],
    });
  }
  for (let index = 1; index < flightPath.length; index += 1) {
    if (flightPath[index].t <= flightPath[index - 1].t) {
      context.addIssue({
        code: "custom",
        message: "Trajectory times must increase strictly.",
        path: [...flightPathPrefix, index, "t"],
      });
    }
  }
  const lastPoint = flightPath[flightPath.length - 1];
  if (
    lastPoint &&
    (["x", "y", "z", "t"] as const).some(
      (axis) => Math.abs(finalPoint[axis] - lastPoint[axis]) > 1e-9,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "final_point must equal the last trajectory point.",
      path: finalPointPrefix,
    });
  }
}

const BackendKickContactSchema: z.ZodType<BackendKickContact> = z
  .object({
    type: z.enum(["PLAYER", "GOALKEEPER", "POST", "CROSSBAR"]),
    player_id: identifier.optional(),
    at: BackendFlightPointSchema,
    speed_mps: z.number().finite().min(0).optional(),
  })
  .strict()
  .superRefine((contact, context) => {
    if (
      (contact.type === "PLAYER" || contact.type === "GOALKEEPER") &&
      (!contact.player_id || contact.speed_mps === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Player contact requires player_id and speed_mps.",
      });
    }
  });

const BackendAutomaticKickFollowUpSchema: z.ZodType<BackendAutomaticKickFollowUp> =
  z
    .object({
      type: z.literal("TEAMMATE_SHOT"),
      actor_player_id: identifier,
      opportunity: z
        .object({
          eligible: z.literal(true),
          score: z.number().finite().min(0).max(100),
          distance_to_goal_m: z.number().finite().min(0),
          nearest_defender_m: z.number().finite().min(0).nullable(),
          lane_blocked: z.literal(false),
          scene_pressure: z.number().finite().min(0).max(100),
          receive_speed_mps: z.number().finite().min(0),
        })
        .strict(),
      flight_path: z.array(BackendFlightPointSchema).min(2),
      flight_outcome: z.string().trim().min(1),
      final_point: BackendFlightPointSchema,
      contact: BackendKickContactSchema.nullable(),
      frame_contacts: z.array(BackendKickContactSchema).max(2),
    })
    .strict()
    .superRefine((followUp, context) => {
      validateFlightTrajectory(
        followUp.flight_path,
        followUp.final_point,
        context,
        ["flight_path"],
        ["final_point"],
      );
    });

export const BackendFieldStateSchema: z.ZodType<BackendFieldState> = z
  .object({
    id: identifier,
    action_sequence: z.number().int().min(1).optional(),
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
    geometry: BackendFieldGeometrySchema.optional(),
    coordinate_system: BackendFieldCoordinateSystemSchema.optional(),
    sequence: BackendFieldSequenceSchema.optional(),
  })
  .passthrough();

export const BackendCurrentFieldStateSchema: z.ZodType<BackendCurrentFieldState> =
  z
    .object({
      id: identifier,
      action_sequence: z.number().int().min(1),
      match_id: identifier,
      minute: z.number().int().min(1).max(89),
      action_type: z.string().trim().min(1),
      scene_family: z.enum([
        "OPEN_PLAY",
        "DRIBBLE",
        "FREE_KICK",
        "CORNER",
        "PENALTY",
        "RANDOM_EVENT",
      ]),
      my_team_positions: z.array(BackendCurrentFieldPlayerSchema).min(1),
      opponent_positions: z.array(BackendCurrentFieldPlayerSchema).min(1),
      legend_player_id: identifier,
      carrier_player_id: identifier,
      distance_to_goal: z.number().finite().min(0).max(100),
      ball_x: coordinate,
      ball_y: coordinate,
      facing_target_x: coordinate.optional(),
      facing_target_y: coordinate.optional(),
      facing_target_player_id: identifier.nullable().optional(),
      carry_offset_m: z.number().finite().min(0).max(2).optional(),
      context: BackendCurrentFieldContextSchema,
      dribble_pattern: z.unknown().optional(),
      geometry: BackendFieldGeometrySchema.optional(),
      coordinate_system: BackendFieldCoordinateSystemSchema,
      sequence: BackendFieldSequenceSchema,
    })
    .strict()
    .superRefine((fieldState, context) => {
      const players = [
        ...fieldState.my_team_positions,
        ...fieldState.opponent_positions,
      ];
      const playerById = new Map(players.map((player) => [player.id, player]));
      const myTeamIds = new Set(
        fieldState.my_team_positions.map((player) => player.id),
      );

      for (const player of fieldState.my_team_positions) {
        if (player.team_side !== "MY_TEAM") {
          context.addIssue({
            code: "custom",
            message: "my_team_positions must declare MY_TEAM ownership.",
            path: ["my_team_positions"],
          });
          break;
        }
      }
      for (const player of fieldState.opponent_positions) {
        if (player.team_side !== "OPPONENT_TEAM") {
          context.addIssue({
            code: "custom",
            message: "opponent_positions must declare OPPONENT_TEAM ownership.",
            path: ["opponent_positions"],
          });
          break;
        }
      }
      for (const playerId of [
        fieldState.legend_player_id,
        fieldState.carrier_player_id,
      ]) {
        if (!myTeamIds.has(playerId)) {
          context.addIssue({
            code: "custom",
            message:
              "Legend and carrier identities must refer to MY_TEAM players.",
            path: ["carrier_player_id"],
          });
        }
      }
      if (
        fieldState.context.carrier_player_id !== fieldState.carrier_player_id
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Field context carrier identity must match the field carrier.",
          path: ["context", "carrier_player_id"],
        });
      }
      if (!playerById.has(fieldState.sequence.anchor_player_id)) {
        context.addIssue({
          code: "custom",
          message: "Sequence anchor must identify a declared field player.",
          path: ["sequence", "anchor_player_id"],
        });
      }
      const goalkeeperId =
        fieldState.sequence.attacking_target.goalkeeper_player_id;
      if (goalkeeperId !== null) {
        const goalkeeper = playerById.get(goalkeeperId);
        if (
          !goalkeeper ||
          goalkeeper.team_side !== "OPPONENT_TEAM" ||
          goalkeeper.role !== "GK"
        ) {
          context.addIssue({
            code: "custom",
            message:
              "The attacking target goalkeeper must identify an opponent goalkeeper.",
            path: ["sequence", "attacking_target", "goalkeeper_player_id"],
          });
        }
      }
    });

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

const currentPlayableScene = z.enum([
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
]);

const BackendCurrentPendingActionSchema = BackendPendingActionSchema.and(
  z
    .object({
      action_sequence: z.number().int().min(1),
      action_type: currentPlayableScene,
      scene_type: currentPlayableScene,
      source: z.enum(["SIMULATION", "FOLLOW_UP", "POSSESSION_CHAIN"]),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      context: BackendCurrentFieldContextSchema,
      field_state: BackendCurrentFieldStateSchema.optional(),
      available_choices: z
        .array(
          z
            .object({
              id: z.string().trim().min(1),
              label: z.string().trim().min(1),
              description: z.string().trim().min(1),
              input_schema: z.record(z.string(), z.unknown()),
            })
            .strict(),
        )
        .min(1),
      origin: z
        .object({
          previous_action_id: identifier,
          previous_outcome: z.string().trim().min(1),
        })
        .strict()
        .nullable(),
    })
    .passthrough(),
).superRefine((action, context) => {
  if (
    ["OPEN_PLAY", "FREE_KICK", "CORNER", "PENALTY"].includes(
      action.scene_type,
    ) &&
    !action.control_envelope
  ) {
    context.addIssue({
      code: "custom",
      message: `${action.scene_type} requires a kick control envelope.`,
      path: ["control_envelope"],
    });
  }

  if (
    action.scene_type === "DRIBBLE" &&
    action.field_state !== undefined &&
    action.field_state.dribble_pattern === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "DRIBBLE requires an authoritative dribble pattern.",
      path: ["field_state", "dribble_pattern"],
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
    player_participation: z
      .enum(["NOT_PARTICIPATING", "PARTICIPATING", "OBSERVING"])
      .optional(),
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
    minute: z.number().int().min(0).max(90),
    team: actionTeam,
    description: z.string().min(1),
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
          // Administrative outcomes are authored before a player decision, so
          // their lifecycle handoff is valid at minute/decision sequence zero.
          match_minute: z.number().int().min(0).max(89),
          decision_sequence: z.number().int().min(0),
        })
        .strict(),
      status: z.literal("PENDING"),
    })
    .strict();

const BackendMatchScoreSchema: z.ZodType<BackendMatchScore> = z
  .object({
    my_team: z.number().int().min(0),
    opponent_team: z.number().int().min(0),
  })
  .strict();

const BackendTeamStatisticLineSchema: z.ZodType<BackendTeamStatisticLine> = z
  .object({
    score: z.number().int().min(0),
    attacks: z.number().int().min(0),
    goals_in_play: z.number().int().min(0),
    yellow_cards: z.number().int().min(0),
    red_cards: z.number().int().min(0),
  })
  .strict();

const BackendTeamStatisticsSchema: z.ZodType<BackendTeamStatistics> = z
  .object({
    my_team: BackendTeamStatisticLineSchema,
    opponent_team: BackendTeamStatisticLineSchema,
  })
  .strict();

const BackendAdministrativeResultSchema: z.ZodType<BackendAdministrativeResult> =
  z
    .object({
      version: z.literal(1),
      responsible_side: z.enum(["MY_TEAM", "OPPONENT_TEAM", "BOTH"]),
      minute: z.number().int().min(0).max(89),
      score_before: BackendMatchScoreSchema,
      score_after: BackendMatchScoreSchema,
      disposition: z.enum([
        "ADMINISTRATIVE_0_3",
        "RESULT_PRESERVED_WORSE",
        "ABANDONED_NO_CONTEST",
      ]),
      no_contest: z.boolean(),
    })
    .strict();

const BackendLegendContributionSchema: z.ZodType<BackendLegendContribution> = z
  .object({
    version: z.literal(1),
    legend_player_id: identifier,
    status: z.enum(["AVAILABLE", "SUBSTITUTED", "INJURED", "EXPELLED"]),
    availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    minutes_played: z.number().int().min(0).max(90),
    interventions: z.number().int().min(0),
    completed_actions: z.number().int().min(0),
    successful_actions: z.number().int().min(0),
    goals: z.number().int().min(0),
    assists: z.number().int().min(0),
    yellow_cards: z.number().int().min(0).max(2),
    red_card: z.boolean(),
    injured: z.boolean(),
    substituted: z.boolean(),
    administrative_result: BackendAdministrativeResultSchema.optional(),
    energy_start: rating,
    energy_current: rating,
    stamina: rating,
  })
  .strict();

const BackendLegendAvailabilitySchema: z.ZodType<BackendLegendAvailabilityState> =
  z
    .object({
      version: z.literal(1),
      status: z.enum(["AVAILABLE", "SUBSTITUTED", "INJURED", "EXPELLED"]),
      availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
      participation: z.enum([
        "NOT_PARTICIPATING",
        "PARTICIPATING",
        "OBSERVING",
      ]),
      interactive_controls: z.boolean(),
      unavailable_since_minute: z.number().int().min(0).max(90).nullable(),
    })
    .strict()
    .superRefine((availability, context) => {
      const unavailable = availability.availability === "UNAVAILABLE";
      const availableStatus = availability.status === "AVAILABLE";
      if (unavailable === availability.interactive_controls) {
        context.addIssue({
          code: "custom",
          message:
            "Legend availability must agree with the authoritative control flag.",
          path: ["interactive_controls"],
        });
      }
      if (unavailable && availability.unavailable_since_minute === null) {
        context.addIssue({
          code: "custom",
          message:
            "An unavailable Legend requires its authoritative removal minute.",
          path: ["unavailable_since_minute"],
        });
      }
      if (!unavailable && availability.unavailable_since_minute !== null) {
        context.addIssue({
          code: "custom",
          message: "An available Legend cannot expose a removal minute.",
          path: ["unavailable_since_minute"],
        });
      }
      if (availableStatus === unavailable) {
        context.addIssue({
          code: "custom",
          message:
            "Legend status must agree with the authoritative availability flag.",
          path: ["status"],
        });
      }
      if (unavailable && availability.participation !== "OBSERVING") {
        context.addIssue({
          code: "custom",
          message: "An unavailable Legend must remain an observer.",
          path: ["participation"],
        });
      }
    });

const BackendHalftimeRecoverySchema: z.ZodType<BackendHalftimeRecovery> = z
  .object({
    version: z.literal(1),
    config_version: z.literal("halftime-recovery/1"),
    eligibility: z.enum(["ELIGIBLE", "INELIGIBLE_UNAVAILABLE"]),
    legend_status: z.enum(["AVAILABLE", "SUBSTITUTED", "INJURED", "EXPELLED"]),
    stamina: rating,
    energy_before: rating,
    energy_recovered: z.number().finite().min(0).max(18),
    energy_after: rating,
    minimum_energy: z.literal(4),
    maximum_energy: z.literal(18),
  })
  .strict();

const BackendHalftimeSummarySchema: z.ZodType<BackendHalftimeSummary> = z
  .object({
    version: z.literal(1),
    match_id: identifier,
    minute: z.literal(45),
    score: BackendMatchScoreSchema,
    team_statistics: BackendTeamStatisticsSchema,
    legend_contribution: BackendLegendContributionSchema,
    recovery: BackendHalftimeRecoverySchema,
    continue_required: z.literal(true),
    tactics_editable: z.literal(false),
  })
  .strict();

const BackendKeyMatchEventSchema: z.ZodType<BackendKeyMatchEvent> = z
  .object({
    event_id: z.number().int().min(1),
    minute: z.number().int().min(0).max(90),
    action: z.string().trim().min(1),
    team: actionTeam,
    description: z.string().trim().min(1),
    score: BackendMatchScoreSchema,
    outcome_type: z.string().trim().min(1).nullable(),
  })
  .strict();

const BackendFullTimeHandoffSchema: z.ZodType<BackendFullTimeHandoff> = z
  .object({
    version: z.literal(2),
    match_id: identifier,
    status: z.enum(["FULL_TIME", "ABANDONED"]),
    terminal_reason: z.enum(["REGULATION", "ADMINISTRATIVE"]),
    final_score: BackendMatchScoreSchema,
    result: z.enum(["WIN", "DRAW", "LOSS", "NO_CONTEST"]),
    season_points_delta: z.union([
      z.literal(-1),
      z.literal(1),
      z.literal(3),
      z.null(),
    ]),
    key_events: z.array(BackendKeyMatchEventSchema),
    team_statistics: BackendTeamStatisticsSchema,
    legend_contribution: BackendLegendContributionSchema,
    pending_settlement_events: z.array(BackendPendingSettlementEventSchema),
    administrative_result: BackendAdministrativeResultSchema.nullable(),
    settlement_status: z.literal("PENDING_HANDOFF"),
  })
  .strict()
  .superRefine((handoff, context) => {
    if (
      handoff.result === "NO_CONTEST" &&
      handoff.season_points_delta !== null
    ) {
      context.addIssue({
        code: "custom",
        message:
          "NO_CONTEST must preserve the backend's null season-point handoff.",
        path: ["season_points_delta"],
      });
    }
    if (
      handoff.result !== "NO_CONTEST" &&
      handoff.season_points_delta === null
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A settled result requires the authoritative season-point delta.",
        path: ["season_points_delta"],
      });
    }
  });

function requireLegendAvailabilityMatchesMatch(
  match: BackendMatch,
  availability: BackendLegendAvailabilityState,
  context: z.RefinementCtx,
) {
  if (
    match.player_participation !== undefined &&
    availability.participation !== match.player_participation
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Legend availability participation must agree with the authoritative match.",
      path: ["legend_availability", "participation"],
    });
  }
}

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
      code: z.enum(["UNSUPPORTED_SCENE_TYPE", "UNSUPPORTED_SCENE_VERSION"]),
      scene_type: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u),
      contract_version: z.number().int().min(1).nullable(),
      supported_contract_version: z.number().int().min(1).nullable(),
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

export interface BackendUnsupportedSceneRecoveryResult {
  version: 1;
  status: "RECOVERED";
  outcome: "SKIPPED_NO_EFFECT";
  scene_type: string;
  action_id: string;
  recovered_revision: number;
}

export const BackendUnsupportedSceneRecoveryResultSchema: z.ZodType<BackendUnsupportedSceneRecoveryResult> =
  z
    .object({
      version: z.literal(1),
      status: z.literal("RECOVERED"),
      outcome: z.literal("SKIPPED_NO_EFFECT"),
      scene_type: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u),
      action_id: identifier,
      recovered_revision: z.number().int().min(1),
    })
    .strict();

export const BackendDecisionResultSchema: z.ZodType<BackendDecisionResult> = z
  .object({
    description: z.string(),
    success: z.boolean(),
    outcome_type: z.string().trim().min(1),
    flight_path: z.array(BackendFlightPointSchema).min(2).optional(),
    flight_outcome: z.string().trim().min(1).optional(),
    final_point: BackendFlightPointSchema.optional(),
    receiver: BackendFieldPlayerSchema.optional(),
    interceptor: BackendFieldPlayerSchema.optional(),
    receiver_control: BackendReceiverControlSchema.optional(),
    automatic_follow_up: BackendAutomaticKickFollowUpSchema.optional(),
    immediate_effects: z.record(z.string(), z.unknown()).optional(),
    pending_settlement_events: z
      .array(BackendPendingSettlementEventSchema)
      .optional(),
    unsupported_scene_recovery:
      BackendUnsupportedSceneRecoveryResultSchema.optional(),
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
    const flightPath = result.flight_path;
    const finalPoint = result.final_point;
    const flightOutcome = result.flight_outcome;
    const hasAnyFlightField = Boolean(
      flightPath || finalPoint || flightOutcome,
    );
    const requiresFlightPlayback =
      hasAnyFlightField ||
      result.automatic_follow_up !== undefined ||
      result.kick_resolution !== undefined;
    if (
      requiresFlightPlayback &&
      (!flightPath || !finalPoint || !flightOutcome)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Trajectory playback requires flight_path, flight_outcome, and final_point.",
        path: !flightPath
          ? ["flight_path"]
          : !flightOutcome
            ? ["flight_outcome"]
            : ["final_point"],
      });
    }
    if (flightPath && finalPoint) {
      validateFlightTrajectory(flightPath, finalPoint, context);
    }
    if (result.automatic_follow_up && !flightPath) {
      context.addIssue({
        code: "custom",
        message:
          "An automatic teammate shot requires the authoritative incoming pass trajectory.",
        path: ["flight_path"],
      });
    }
    if (result.automatic_follow_up && finalPoint) {
      const automaticStart = result.automatic_follow_up.flight_path[0];
      if (
        automaticStart &&
        (["x", "y", "z"] as const).some(
          (axis) => Math.abs(automaticStart[axis] - finalPoint[axis]) > 1e-9,
        )
      ) {
        context.addIssue({
          code: "custom",
          message:
            "An automatic teammate shot must start at the incoming pass final point.",
          path: ["automatic_follow_up", "flight_path", 0],
        });
      }
    }
    if (result.automatic_follow_up) {
      if (!result.receiver) {
        context.addIssue({
          code: "custom",
          message:
            "An automatic teammate shot requires its authoritative receiver.",
          path: ["receiver"],
        });
      } else if (
        result.automatic_follow_up.actor_player_id !== result.receiver.id
      ) {
        context.addIssue({
          code: "custom",
          message:
            "The automatic shot actor must be the authoritative receiver.",
          path: ["automatic_follow_up", "actor_player_id"],
        });
      }
    }

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

const BackendLastDecisionSchema: z.ZodType<BackendLastDecision> = z
  .object({
    id: identifier,
    match_id: identifier,
    sequence: z.number().int().min(1),
    minute: z.number().int().min(1).max(89),
    action: z.string().trim().min(1),
    action_team: actionTeam,
    action_id: identifier,
    action_version: z.number().int().min(1),
    decision_version: z.number().int().min(1).max(5),
    decision_data: z.record(z.string(), z.unknown()),
    field_state_id: identifier,
    timestamp: z.number().finite().min(0),
  })
  .passthrough();

const BackendOperationPlaybackSchema: z.ZodType<BackendOperationPlayback> = z
  .object({
    version: z.literal(1),
    submitted_action: BackendPendingActionSchema.nullable(),
    submitted_field_state: BackendFieldStateSchema.nullable(),
    last_decision: BackendLastDecisionSchema.nullable(),
    decision_result: BackendDecisionResultSchema.nullable(),
    events: z.array(BackendTimelineEventSchema),
  })
  .strict();

function appendSchemaIssues(
  result: { success: boolean; error?: z.ZodError },
  context: z.RefinementCtx,
  prefix: (string | number)[],
) {
  if (result.success) return;
  for (const issue of result.error?.issues ?? []) {
    context.addIssue({
      ...issue,
      path: [...prefix, ...issue.path],
    });
  }
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function validateCurrentFieldState(
  value: unknown,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  appendSchemaIssues(
    BackendCurrentFieldStateSchema.safeParse(value),
    context,
    path,
  );
}

function validateCurrentPendingAction(
  value: BackendPendingAction | null,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (!value) return;
  appendSchemaIssues(
    BackendCurrentPendingActionSchema.safeParse(value),
    context,
    path,
  );
}

function validateCurrentDecisionResult(
  value: BackendDecisionResult | undefined,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (!value) return;
  if (value.receiver !== undefined) {
    appendSchemaIssues(
      BackendCurrentFieldPlayerSchema.safeParse(value.receiver),
      context,
      [...path, "receiver"],
    );
  }
  if (value.interceptor !== undefined) {
    appendSchemaIssues(
      BackendCurrentFieldPlayerSchema.safeParse(value.interceptor),
      context,
      [...path, "interceptor"],
    );
  }
  const followUpContext = value.follow_up_context;
  if (followUpContext !== undefined) {
    appendSchemaIssues(
      BackendCurrentFieldContextSchema.safeParse(followUpContext),
      context,
      [...path, "follow_up_context"],
    );
  }
}

function validateCurrentOperationReceipt(
  value: BackendMatchOperationReceipt | null | undefined,
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  const playback = value?.playback;
  if (!playback) return;
  if (playback.submitted_action) {
    validateCurrentPendingAction(playback.submitted_action, context, [
      ...path,
      "playback",
      "submitted_action",
    ]);
  }
  if (playback.submitted_field_state) {
    validateCurrentFieldState(playback.submitted_field_state, context, [
      ...path,
      "playback",
      "submitted_field_state",
    ]);
  }
  validateCurrentDecisionResult(
    playback.decision_result ?? undefined,
    context,
    [...path, "playback", "decision_result"],
  );
}

function validateCurrentEngineResponse(
  response: BackendMatchResponse | BackendMatchSnapshot,
  context: z.RefinementCtx,
) {
  if (response.match.engine_version !== "match-engine/6") return;
  validateCurrentPendingAction(response.pending_action, context, [
    "pending_action",
  ]);
  validateCurrentPendingAction(response.match.pending_action, context, [
    "match",
    "pending_action",
  ]);
  if (response.field_state) {
    validateCurrentFieldState(response.field_state, context, ["field_state"]);
  }
  if ("decision_result" in response) {
    validateCurrentDecisionResult(
      (response as BackendMatchResponse).decision_result,
      context,
      ["decision_result"],
    );
  }
  validateCurrentOperationReceipt(response.latest_operation, context, [
    "latest_operation",
  ]);
}

export const BackendMatchOperationReceiptSchema: z.ZodType<BackendMatchOperationReceipt> =
  z
    .object({
      version: z.literal(1),
      operation_id: identifier,
      operation: z.enum([
        "createMatch",
        "startMatch",
        "resumeMatch",
        "abandonMatch",
        "processMatchAction",
      ]),
      status: z.literal("COMMITTED"),
      request_revision: z.number().int().min(0).nullable(),
      committed_revision: z.number().int().min(0),
      action_id: identifier.nullable(),
      playback: BackendOperationPlaybackSchema.nullable(),
    })
    .strict();

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
    legend_availability: BackendLegendAvailabilitySchema,
    halftime_summary: BackendHalftimeSummarySchema.nullable(),
    full_time_handoff: BackendFullTimeHandoffSchema.nullable(),
    latest_operation: BackendMatchOperationReceiptSchema.nullable().optional(),
  })
  .passthrough()
  .superRefine((response, context) => {
    validateCurrentEngineResponse(response, context);
    requireLegendAvailabilityMatchesMatch(
      response.match,
      response.legend_availability,
      context,
    );
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
    if (
      response.halftime_summary &&
      (response.halftime_summary.match_id !== response.match.id ||
        (response.status === "HALFTIME" &&
          (response.halftime_summary.score.my_team !==
            response.match.my_team_score ||
            response.halftime_summary.score.opponent_team !==
              response.match.opponent_team_score)))
    ) {
      context.addIssue({
        code: "custom",
        message: "Halftime summary must belong to and agree with its match.",
        path: ["halftime_summary"],
      });
    }
    if (response.status === "HALFTIME" && !response.halftime_summary) {
      context.addIssue({
        code: "custom",
        message: "HALFTIME requires an authoritative halftime summary.",
        path: ["halftime_summary"],
      });
    }
    if (
      response.status === "FINISHED" &&
      response.match.engine_version === "match-engine/5" &&
      !response.full_time_handoff
    ) {
      context.addIssue({
        code: "custom",
        message: "FINISHED requires an authoritative full-time handoff.",
        path: ["full_time_handoff"],
      });
    }
    if (
      response.full_time_handoff &&
      (response.full_time_handoff.match_id !== response.match.id ||
        response.full_time_handoff.final_score.my_team !==
          response.match.my_team_score ||
        response.full_time_handoff.final_score.opponent_team !==
          response.match.opponent_team_score)
    ) {
      context.addIssue({
        code: "custom",
        message: "Full-time handoff must belong to and agree with its match.",
        path: ["full_time_handoff"],
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
      !jsonValuesEqual(response.field_state, embeddedField)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Embedded and top-level field states must be identical authoritative copies.",
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
    legend_availability: BackendLegendAvailabilitySchema,
    halftime_summary: BackendHalftimeSummarySchema.nullable(),
    full_time_handoff: BackendFullTimeHandoffSchema.nullable(),
    latest_operation: BackendMatchOperationReceiptSchema.nullable(),
  })
  .strict()
  .superRefine((response, context) => {
    validateCurrentEngineResponse(response, context);
    requireMatchTeamIdentity(response, context);
    requireLegendAvailabilityMatchesMatch(
      response.match,
      response.legend_availability,
      context,
    );
    if (
      response.halftime_summary &&
      (response.halftime_summary.match_id !== response.match.id ||
        (response.match.match_status === "HALFTIME" &&
          (response.halftime_summary.score.my_team !==
            response.match.my_team_score ||
            response.halftime_summary.score.opponent_team !==
              response.match.opponent_team_score)))
    ) {
      context.addIssue({
        code: "custom",
        message: "Halftime summary must belong to and agree with its match.",
        path: ["halftime_summary"],
      });
    }
    if (
      response.match.match_status === "HALFTIME" &&
      !response.halftime_summary
    ) {
      context.addIssue({
        code: "custom",
        message: "HALFTIME requires an authoritative halftime summary.",
        path: ["halftime_summary"],
      });
    }
    if (
      response.match.match_status === "FINISHED" &&
      response.match.engine_version === "match-engine/5" &&
      !response.full_time_handoff
    ) {
      context.addIssue({
        code: "custom",
        message: "FINISHED requires an authoritative full-time handoff.",
        path: ["full_time_handoff"],
      });
    }
    if (
      response.full_time_handoff &&
      (response.full_time_handoff.match_id !== response.match.id ||
        response.full_time_handoff.final_score.my_team !==
          response.match.my_team_score ||
        response.full_time_handoff.final_score.opponent_team !==
          response.match.opponent_team_score)
    ) {
      context.addIssue({
        code: "custom",
        message: "Full-time handoff must belong to and agree with its match.",
        path: ["full_time_handoff"],
      });
    }
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
    retryable: z.boolean(),
    recovery_action: z.enum([
      "REAUTHENTICATE",
      "CHECK_TRANSPORT",
      "HYDRATE_MATCH",
      "USE_RECOVERY_INTENT",
      "FIX_REQUEST",
      "RETRY_SAME_REQUEST",
      "STOP",
    ]),
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
