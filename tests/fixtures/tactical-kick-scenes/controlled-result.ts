import openPlayScene from "./open-play.json" with { type: "json" };

export const controlledResultExpectation = {
  actionMinute: 12,
  continuationMinute: 15,
  receiverId: "team_1_RCM_7",
  receiverPosition: { x: 63.25, y: 41.75 },
  facingTarget: {
    x: 50.256623494345696,
    y: 5.182164659127596,
    playerId: "team_2_GK_1",
  },
  carryOffsetM: 0.65,
  ballPosition: { x: 63.03563779098956, y: 41.14639522804265 },
} as const;

export function controlledKickResponse() {
  const response = structuredClone(openPlayScene);
  const expectation = controlledResultExpectation;
  const originalAction = response.pending_action;
  const originalField = response.field_state;
  const receiver = originalField.my_team_positions.find(
    (player) => player.id === expectation.receiverId,
  );
  if (!receiver)
    throw new Error("Controlled result receiver fixture is missing");

  const receiverControl = {
    carrier_player_id: expectation.receiverId,
    facing_target_x: expectation.facingTarget.x,
    facing_target_y: expectation.facingTarget.y,
    facing_target_player_id: expectation.facingTarget.playerId,
    carry_offset_m: expectation.carryOffsetM,
  };
  const continuationField = {
    ...originalField,
    id: "field-controlled-continuation",
    minute: expectation.continuationMinute,
    distance_to_goal: 43.75,
    carrier_player_id: expectation.receiverId,
    ball_x: expectation.ballPosition.x,
    ball_y: expectation.ballPosition.y,
    facing_target_x: expectation.facingTarget.x,
    facing_target_y: expectation.facingTarget.y,
    facing_target_player_id: expectation.facingTarget.playerId,
    carry_offset_m: expectation.carryOffsetM,
    context: {
      ...originalField.context,
      carrier_player_id: expectation.receiverId,
      previous_outcome: "KICK_TO_OPEN_PLAY",
    },
    my_team_positions: originalField.my_team_positions.map((player) => {
      if (player.id === originalField.legend_player_id) {
        return { ...player, has_ball: false };
      }
      if (player.id !== expectation.receiverId) return player;
      return {
        ...player,
        ...expectation.receiverPosition,
        is_legend: false,
        has_ball: true,
        facing_target_x: expectation.facingTarget.x,
        facing_target_y: expectation.facingTarget.y,
        facing_target_player_id: expectation.facingTarget.playerId,
        carry_offset_m: expectation.carryOffsetM,
      };
    }),
  };
  const continuationAction = {
    ...originalAction,
    id: "action-controlled-continuation",
    action_sequence: 2,
    minute: expectation.continuationMinute,
    source: "POSSESSION_CHAIN",
    title: "Open Play",
    description: "Your teammate controls the pass and keeps possession.",
    field_state_id: continuationField.id,
    context: { ...continuationField.context },
    origin: {
      previous_action_id: originalAction.id,
      previous_outcome: "KICK_TO_OPEN_PLAY",
    },
    field_state: continuationField,
  };

  return {
    ...response,
    minute: expectation.continuationMinute,
    prev_time: expectation.actionMinute,
    status: "WAITING_FOR_DECISION",
    pending_action: continuationAction,
    field_state: continuationField,
    pending_settlement_events: [],
    unsupported_scene: null,
    legend_availability: {
      version: 1 as const,
      status: "AVAILABLE" as const,
      availability: "AVAILABLE" as const,
      participation: "PARTICIPATING" as const,
      interactive_controls: true,
      unavailable_since_minute: null,
    },
    halftime_summary: null,
    full_time_handoff: null,
    action: "OPEN_PLAY",
    action_team: "MY_TEAM",
    events: [
      {
        match_id: response.match.id,
        event_id: 1,
        action: "OPEN_PLAY",
        minute: expectation.actionMinute,
        team: "MY_TEAM",
        description: "Successful pass. Your team keeps the ball alive.",
        my_team_score: response.match.my_team_score,
        opponent_team_score: response.match.opponent_team_score,
        my_team_scored: false,
        opponent_team_scored: false,
        player_participates: true,
      },
    ],
    match: {
      ...response.match,
      current_time: expectation.continuationMinute,
      prev_time: expectation.actionMinute,
      revision: response.match.revision + 1,
      event_counter: 1,
      match_status: "WAITING_FOR_DECISION",
      pending_action: continuationAction,
    },
    decision_result: {
      description: "Successful pass. Your team keeps the ball alive.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_outcome: "TEAMMATE_CONTROL",
      flight_path: [
        { x: originalField.ball_x, y: originalField.ball_y, z: 0.11, t: 0 },
        { x: 58.4, y: 25.2, z: 1.85, t: 0.2 },
        {
          x: expectation.receiverPosition.x,
          y: expectation.receiverPosition.y,
          z: 0.11,
          t: 0.4,
        },
      ],
      final_point: {
        x: expectation.receiverPosition.x,
        y: expectation.receiverPosition.y,
        z: 0.11,
        t: 0.4,
      },
      receiver: {
        ...receiver,
        ...expectation.receiverPosition,
        is_legend: false,
        has_ball: true,
      },
      receiver_control: receiverControl,
      possession_follow_up: {
        type: "TIMELINE",
        ...receiverControl,
      },
    },
  };
}
