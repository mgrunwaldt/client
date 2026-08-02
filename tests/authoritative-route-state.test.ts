import { describe, expect, it } from "vitest";

import type { BackendMatch, BackendTeam } from "../src/lib/backend-match";
import {
  hasAuthoritativePrematchState,
  hasAuthoritativeTimelineState,
} from "../src/match/authoritative-route-state";

const myTeam: BackendTeam = {
  id: "team-1",
  name: "Authoritative XI",
  offense: 80,
  defense: 75,
  intensity: 70,
};
const opponentTeam: BackendTeam = {
  id: "team-2",
  name: "Backend United",
  offense: 76,
  defense: 74,
  intensity: 72,
};
const match: BackendMatch = {
  id: "match-route-1",
  my_team_id: myTeam.id,
  opponent_team_id: opponentTeam.id,
  my_team_score: 0,
  opponent_team_score: 0,
  current_time: 0,
  prev_time: 0,
  revision: 1,
  match_status: "NOT_STARTED",
  pending_action: null,
  legend_player_id: "team-1-ST-10",
  legend_profile: {
    stamina: 63,
    energy: 58,
    shoot: 74,
    dribble: 72,
    speed: 71,
    passing: 75,
    heading: 69,
    defense: 61,
    intelligence: 77,
  },
};

describe("authoritative match route readiness", () => {
  it("requires the exact requested match and both backend teams for Timeline", () => {
    expect(
      hasAuthoritativeTimelineState({
        routeMatchId: match.id,
        match,
        myTeam,
        opponentTeam,
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeTimelineState({
        routeMatchId: "another-match",
        match,
        myTeam,
        opponentTeam,
      }),
    ).toBe(false);
    expect(
      hasAuthoritativeTimelineState({
        routeMatchId: match.id,
        match,
        myTeam: null,
        opponentTeam,
      }),
    ).toBe(false);
  });

  it("also requires the authoritative Legend identity and profile for Prematch", () => {
    const state = {
      routeMatchId: match.id,
      match,
      myTeam,
      opponentTeam,
    };
    expect(hasAuthoritativePrematchState(state)).toBe(true);
    expect(
      hasAuthoritativePrematchState({
        ...state,
        match: { ...match, legend_player_id: undefined },
      }),
    ).toBe(false);
    expect(
      hasAuthoritativePrematchState({
        ...state,
        match: { ...match, legend_profile: undefined },
      }),
    ).toBe(false);
  });
});
