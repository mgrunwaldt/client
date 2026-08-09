import type {
  BackendFieldPlayer,
  BackendFieldState,
  BackendMatchResponse,
  BackendReceiverControl,
} from "./api-v1/contract";

export function authoritativeContinuationFieldState(
  response: BackendMatchResponse,
): BackendFieldState | null {
  return response.pending_action?.field_state ?? response.field_state ?? null;
}

export function authoritativeFacingTarget(
  player: BackendFieldPlayer,
  receiverControl?: BackendReceiverControl,
) {
  if (receiverControl?.carrier_player_id === player.id) {
    return {
      x: receiverControl.facing_target_x,
      y: receiverControl.facing_target_y,
    };
  }
  if (
    typeof player.facing_target_x === "number" &&
    typeof player.facing_target_y === "number"
  ) {
    return { x: player.facing_target_x, y: player.facing_target_y };
  }
  return null;
}
