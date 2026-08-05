import { describe, expect, it } from "vitest";

import {
  type BackendFieldState,
  BackendMatchResponseSchema,
} from "../src/match/api-v1/contract";
import {
  authoritativeContinuationFieldState,
  authoritativeFacingTarget,
} from "../src/match/receiver-control";
import {
  automaticKickResponse,
  controlledKickResponse,
  controlledResultExpectation,
} from "./fixtures/tactical-kick-scenes/controlled-result";

function responseWithFieldState(fieldState: BackendFieldState) {
  const response = controlledKickResponse();
  const pendingAction = {
    ...response.pending_action,
    field_state_id: fieldState.id,
    field_state: fieldState,
  };
  return {
    ...response,
    pending_action: pendingAction,
    field_state: fieldState,
    match: { ...response.match, pending_action: pendingAction },
  };
}

describe("authoritative receiver control", () => {
  it("preserves the receiver, facing vector, carry offset, and continuation ball", () => {
    const response = BackendMatchResponseSchema.parse(controlledKickResponse());
    const expectation = controlledResultExpectation;
    const fieldState = authoritativeContinuationFieldState(response);
    const control = response.decision_result?.receiver_control;
    const carrier = fieldState?.my_team_positions.find(
      (player) => player.id === expectation.receiverId,
    );

    expect(response.prev_time).toBe(expectation.actionMinute);
    expect(response.minute).toBe(expectation.continuationMinute);
    expect(response.minute).toBeGreaterThan(response.prev_time);
    expect(response.decision_result?.receiver?.id).toBe(expectation.receiverId);
    expect(control).toEqual({
      carrier_player_id: expectation.receiverId,
      facing_target_x: expectation.facingTarget.x,
      facing_target_y: expectation.facingTarget.y,
      facing_target_player_id: expectation.facingTarget.playerId,
      carry_offset_m: expectation.carryOffsetM,
    });
    expect(carrier).toMatchObject({
      id: expectation.receiverId,
      ...expectation.receiverPosition,
      has_ball: true,
      facing_target_x: expectation.facingTarget.x,
      facing_target_y: expectation.facingTarget.y,
      facing_target_player_id: expectation.facingTarget.playerId,
      carry_offset_m: expectation.carryOffsetM,
    });
    expect(fieldState).toMatchObject({
      carrier_player_id: expectation.receiverId,
      ball_x: expectation.ballPosition.x,
      ball_y: expectation.ballPosition.y,
    });
    expect(fieldState?.legend_player_id).not.toBe(expectation.receiverId);
    expect(authoritativeFacingTarget(carrier!, control)).toEqual({
      x: expectation.facingTarget.x,
      y: expectation.facingTarget.y,
    });
    expect(
      authoritativeFacingTarget(
        { ...carrier!, facing_target_x: 1, facing_target_y: 99 },
        control,
      ),
    ).toEqual({
      x: expectation.facingTarget.x,
      y: expectation.facingTarget.y,
    });
    expect(expectation.ballPosition.y).not.toBe(
      expectation.receiverPosition.y + 1.1,
    );
    expect(expectation.ballPosition.x).not.toBe(expectation.receiverPosition.x);
  });

  it("rejects missing, extra, malformed, or mismatched receiver control", () => {
    const missing = controlledKickResponse();
    const missingDecisionResult = {
      ...missing.decision_result,
      receiver_control: undefined,
    };
    const extra = controlledKickResponse();
    const malformed = controlledKickResponse();
    const wrongReceiver = controlledKickResponse();

    expect(
      BackendMatchResponseSchema.safeParse({
        ...missing,
        decision_result: missingDecisionResult,
      }).success,
    ).toBe(false);
    expect(
      BackendMatchResponseSchema.safeParse({
        ...extra,
        decision_result: {
          ...extra.decision_result,
          receiver_control: {
            ...extra.decision_result.receiver_control,
            client_offset: 1.1,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      BackendMatchResponseSchema.safeParse({
        ...malformed,
        decision_result: {
          ...malformed.decision_result,
          receiver_control: {
            ...malformed.decision_result.receiver_control,
            carry_offset_m: 2.1,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      BackendMatchResponseSchema.safeParse({
        ...wrongReceiver,
        decision_result: {
          ...wrongReceiver.decision_result,
          receiver_control: {
            ...wrongReceiver.decision_result.receiver_control,
            carrier_player_id: "team_1_wrong_receiver",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects invented or non-monotonic continuation state", () => {
    const response = controlledKickResponse();
    const carrierId = controlledResultExpectation.receiverId;
    const mismatchedField = {
      ...response.field_state,
      my_team_positions: response.field_state.my_team_positions.map((player) =>
        player.id === carrierId
          ? {
              ...player,
              facing_target_x: controlledResultExpectation.facingTarget.x + 1,
            }
          : player,
      ),
    } as unknown as BackendFieldState;
    const controlled = controlledKickResponse();
    const nonMonotonic = {
      ...controlled,
      minute: controlled.prev_time,
      match: { ...controlled.match, current_time: controlled.prev_time },
    };

    expect(
      BackendMatchResponseSchema.safeParse(
        responseWithFieldState(mismatchedField),
      ).success,
    ).toBe(false);
    expect(BackendMatchResponseSchema.safeParse(nonMonotonic).success).toBe(
      false,
    );
  });

  it("requires the automatic shot actor to be the authoritative receiver", () => {
    const response = automaticKickResponse();
    expect(BackendMatchResponseSchema.safeParse(response).success).toBe(true);

    const mismatchedActor = structuredClone(response);
    mismatchedActor.decision_result!.automatic_follow_up!.actor_player_id =
      "team_1_wrong_receiver";
    expect(BackendMatchResponseSchema.safeParse(mismatchedActor).success).toBe(
      false,
    );
  });
});
