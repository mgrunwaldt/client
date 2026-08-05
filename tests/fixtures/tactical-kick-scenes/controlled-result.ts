import type { BackendMatchResponse } from "../../../src/match/api-v1/contract";
import controlledPassResponse from "./controlled-pass-response.json" with { type: "json" };
import controlledPassScene from "./controlled-pass-scene.json" with { type: "json" };

const decisionResult = controlledPassResponse.decision_result;
const receiver = decisionResult.receiver;
const receiverControl = decisionResult.receiver_control;

if (!receiver || !receiverControl) {
  throw new Error("Controlled engine/6 pass fixture is incomplete");
}
const carrier = controlledPassResponse.field_state.my_team_positions.find(
  (player) => player.id === receiverControl.carrier_player_id,
);
if (!carrier) {
  throw new Error("Controlled engine/6 continuation carrier is missing");
}

export const controlledResultExpectation = {
  actionMinute: controlledPassResponse.prev_time,
  continuationMinute: controlledPassResponse.minute,
  receiverId: receiver.id,
  resultReceiverPosition: { x: receiver.x, y: receiver.y },
  receiverPosition: { x: carrier.x, y: carrier.y },
  facingTarget: {
    x: receiverControl.facing_target_x,
    y: receiverControl.facing_target_y,
    playerId: receiverControl.facing_target_player_id,
  },
  carryOffsetM: receiverControl.carry_offset_m,
  ballPosition: {
    x: controlledPassResponse.field_state.ball_x,
    y: controlledPassResponse.field_state.ball_y,
  },
} as const;

export function controlledKickScene() {
  return structuredClone(controlledPassScene);
}

export function controlledKickResponse() {
  return structuredClone(controlledPassResponse);
}

export const automaticShotExpectation = {
  receiverId: receiver.id,
  receivePoint: {
    x: decisionResult.final_point.x,
    y: decisionResult.final_point.y,
  },
  shotFinalPoint: { x: 50, y: -0.2, z: 0.11 },
} as const;

export function automaticKickResponse() {
  const response = structuredClone(
    controlledPassResponse,
  ) as unknown as BackendMatchResponse;
  const automaticFollowUp = {
    type: "TEAMMATE_SHOT" as const,
    actor_player_id: receiver.id,
    opportunity: {
      eligible: true as const,
      score: 84,
      distance_to_goal_m: 11,
      nearest_defender_m: 3,
      lane_blocked: false as const,
      scene_pressure: 62,
      receive_speed_mps: 8,
    },
    flight_path: [
      { ...decisionResult.final_point, t: 0 },
      { x: 50, y: 8, z: 1.4, t: 0.35 },
      { x: 50, y: -0.2, z: 0.11, t: 0.7 },
    ],
    flight_outcome: "OUT",
    final_point: { x: 50, y: -0.2, z: 0.11, t: 0.7 },
    contact: null,
    frame_contacts: [],
  };
  response.status = "IN_PROGRESS";
  response.action = null;
  response.action_team = null;
  response.pending_action = null;
  response.field_state = null;
  response.match.match_status = "IN_PROGRESS";
  response.match.pending_action = null;
  response.decision_result = {
    ...response.decision_result,
    description:
      "The pass creates a shooting chance, but the automatic finish does not score.",
    success: false,
    loose_possession: true,
    outcome_type: "AUTOMATIC_TEAMMATE_MISSED",
    automatic_follow_up: automaticFollowUp,
  };
  delete response.decision_result.possession_follow_up;
  (
    response.decision_result.kick_resolution as Record<string, unknown>
  ).follow_up = {
    type: "AUTOMATIC_SHOT",
  };
  return response;
}
