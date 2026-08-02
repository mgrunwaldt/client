import type { BackendMatch, BackendTeam } from "./api-v1/contract";

interface AuthoritativeRouteState {
  routeMatchId: string | undefined;
  match: BackendMatch | null;
  myTeam: BackendTeam | null;
  opponentTeam: BackendTeam | null;
}

export function hasAuthoritativeTimelineState({
  routeMatchId,
  match,
  myTeam,
  opponentTeam,
}: AuthoritativeRouteState) {
  return Boolean(
    routeMatchId && match?.id === routeMatchId && myTeam && opponentTeam,
  );
}

export function hasAuthoritativePrematchState(state: AuthoritativeRouteState) {
  return Boolean(
    hasAuthoritativeTimelineState(state) &&
      state.match?.legend_player_id &&
      state.match.legend_profile,
  );
}
