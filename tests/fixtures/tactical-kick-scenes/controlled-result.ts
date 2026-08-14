import type {
  BackendDecisionResult,
  BackendMatchResponse,
} from "../../../src/match/api-v1/contract";
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

const automaticKickStart = { x: 50, y: 23, z: 0.11 } as const;
const automaticReceivePoint = { x: 50, y: 18, z: 0.11, t: 0.35 } as const;

export function automaticKickScene() {
  const scene = structuredClone(controlledPassScene);
  const legend = scene.field_state.my_team_positions.find(
    (player) => player.id === scene.field_state.legend_player_id,
  );
  const receivingPlayer = scene.field_state.my_team_positions.find(
    (player) => player.id === receiver.id,
  );
  const goalkeeper = scene.field_state.opponent_positions.find(
    (player) => player.id === "team_2_GK_1",
  );
  const blockingDefender = scene.field_state.opponent_positions.find(
    (player) => player.id === "team_2_RCB_3",
  );
  if (!legend || !receivingPlayer || !goalkeeper || !blockingDefender) {
    throw new Error("Automatic finish scene players are incomplete");
  }

  legend.x = automaticKickStart.x;
  legend.y = automaticKickStart.y;
  receivingPlayer.x = automaticReceivePoint.x;
  receivingPlayer.y = automaticReceivePoint.y;
  goalkeeper.x = 50.36;
  goalkeeper.y = 4.56;
  blockingDefender.x = 60.12;
  blockingDefender.y = 15.03;
  scene.field_state.ball_x = automaticKickStart.x;
  scene.field_state.ball_y = automaticKickStart.y;
  scene.field_state.distance_to_goal = automaticKickStart.y;
  scene.field_state.sequence.camera.mode = "FIXED_ATTACKING_THIRD";
  scene.field_state.sequence.camera.view_window = {
    left: 0,
    top: -6,
    width: 100,
    height: 50,
  };
  return scene;
}

export const automaticShotExpectation = {
  receiverId: receiver.id,
  receivePoint: automaticReceivePoint,
  shotFinalPoint: { x: 60, y: -0.2, z: 0.11 },
} as const;

export type AutomaticFinishFixtureOutcome =
  | "blocked"
  | "goal"
  | "missed"
  | "saved";

const automaticFinishFixture = {
  blocked: {
    contact: {
      type: "PLAYER" as const,
      player_id: "team_2_RCB_3",
      at: { x: 60.12, y: 15.03, z: 0.65, t: 0.62 },
      speed_mps: 18,
    },
    description: "The defender blocks the automatic finish.",
    finalPoint: { x: 60.12, y: 15.03, z: 0.65, t: 0.62 },
    flightOutcome: "DEFENDER_INTERCEPT",
    outcomeType: "AUTOMATIC_TEAMMATE_BLOCKED",
  },
  goal: {
    contact: null,
    description:
      "The pass creates a clear chance. Your teammate turns and scores.",
    finalPoint: { x: 47.5, y: -0.2, z: 0.7, t: 0.7 },
    flightOutcome: "GOAL",
    outcomeType: "AUTOMATIC_TEAMMATE_GOAL",
  },
  missed: {
    contact: null,
    description:
      "The pass creates a shooting chance, but the automatic finish does not score.",
    finalPoint: { x: 60, y: -0.2, z: 0.11, t: 0.7 },
    flightOutcome: "OUT",
    outcomeType: "AUTOMATIC_TEAMMATE_MISSED",
  },
  saved: {
    contact: {
      type: "GOALKEEPER" as const,
      player_id: "team_2_GK_1",
      at: { x: 50.36, y: 4.56, z: 0.9, t: 0.68 },
      speed_mps: 17,
    },
    description: "The goalkeeper saves the automatic finish.",
    finalPoint: { x: 50.36, y: 4.56, z: 0.9, t: 0.68 },
    flightOutcome: "KEEPER_SAVE",
    outcomeType: "AUTOMATIC_TEAMMATE_SAVED",
  },
} as const;

export function automaticFinishExpectation(
  outcome: AutomaticFinishFixtureOutcome,
) {
  const fixture = automaticFinishFixture[outcome];
  return {
    contactPlayerId: fixture.contact?.player_id ?? null,
    finalPoint: fixture.finalPoint,
    outcomeType: fixture.outcomeType,
    presentationOutcome: outcome,
    score: outcome === "goal" ? 1 : 0,
  } as const;
}

export function automaticKickResponse(
  outcome: AutomaticFinishFixtureOutcome = "missed",
) {
  const response = structuredClone(
    controlledPassResponse,
  ) as unknown as BackendMatchResponse;
  const fixture = automaticFinishFixture[outcome];
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
      { ...automaticReceivePoint, t: 0 },
      {
        x: (automaticReceivePoint.x + fixture.finalPoint.x) / 2,
        y: (automaticReceivePoint.y + fixture.finalPoint.y) / 2,
        z: Math.max(0.8, fixture.finalPoint.z),
        t: 0.35,
      },
      fixture.finalPoint,
    ],
    flight_outcome: fixture.flightOutcome,
    final_point: fixture.finalPoint,
    contact: fixture.contact,
    frame_contacts: [],
  };
  response.status = "IN_PROGRESS";
  response.action = null;
  response.action_team = null;
  response.pending_action = null;
  response.field_state = null;
  response.match.match_status = "IN_PROGRESS";
  response.match.pending_action = null;
  response.match.my_team_score = outcome === "goal" ? 1 : 0;
  const responseDecision = response.decision_result;
  if (!responseDecision?.receiver || !responseDecision.kick_resolution) {
    throw new Error("Automatic finish response decision is incomplete");
  }
  const automaticDecision: BackendDecisionResult = {
    ...responseDecision,
    flight_path: [
      { ...automaticKickStart, t: 0 },
      {
        x: automaticReceivePoint.x,
        y: (automaticKickStart.y + automaticReceivePoint.y) / 2,
        z: 0.11,
        t: 0.18,
      },
      automaticReceivePoint,
    ],
    final_point: automaticReceivePoint,
    receiver: {
      ...responseDecision.receiver,
      x: automaticReceivePoint.x,
      y: automaticReceivePoint.y,
    },
    description: fixture.description,
    success: outcome === "goal",
    loose_possession: outcome !== "goal",
    my_team_scored: outcome === "goal",
    outcome_type: fixture.outcomeType,
    automatic_follow_up: automaticFollowUp,
  };
  response.decision_result = automaticDecision;
  const kickResolution = automaticDecision.kick_resolution as Record<
    string,
    unknown
  >;
  kickResolution.contact = {
    type: "PLAYER",
    player_id: receiver.id,
    at: automaticReceivePoint,
    speed_mps: 8,
  };
  delete automaticDecision.possession_follow_up;
  kickResolution.follow_up = {
    type: "AUTOMATIC_SHOT",
    actor_player_id: receiver.id,
  };
  return response;
}
