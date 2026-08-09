import type { BackendMatch, BackendTeam } from "./api-v1/contract";

interface AuthoritativeRouteState {
  routeMatchId: string | undefined;
  match: BackendMatch | null;
  myTeam: BackendTeam | null;
  opponentTeam: BackendTeam | null;
}

export function hasAuthoritativeMatchIdentity({
  routeMatchId,
  match,
  myTeam,
  opponentTeam,
}: AuthoritativeRouteState) {
  return Boolean(
    routeMatchId &&
      match?.id === routeMatchId &&
      myTeam?.id === match.my_team_id &&
      opponentTeam?.id === match.opponent_team_id,
  );
}

export function hasAuthoritativeTimelineState(state: AuthoritativeRouteState) {
  return Boolean(
    hasAuthoritativeMatchIdentity(state) &&
      state.match &&
      ["IN_PROGRESS", "WAITING_FOR_DECISION", "HALFTIME"].includes(
        state.match.match_status,
      ),
  );
}

export function hasAuthoritativePrematchState(state: AuthoritativeRouteState) {
  return Boolean(
    hasAuthoritativeMatchIdentity(state) &&
      state.match?.match_status === "NOT_STARTED" &&
      state.match?.legend_player_id &&
      state.match.legend_profile,
  );
}
