import { describe, expect, it } from "vitest";

import type { BackendMatch, BackendTeam } from "../src/lib/backend-match";
import {
  hasAuthoritativeMatchIdentity,
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
  it("binds the requested match to its exact backend team identities", () => {
    const state = {
      routeMatchId: match.id,
      match,
      myTeam,
      opponentTeam,
    };
    expect(hasAuthoritativeMatchIdentity(state)).toBe(true);
    expect(
      hasAuthoritativeMatchIdentity({
        ...state,
        routeMatchId: "another-match",
      }),
    ).toBe(false);
    expect(
      hasAuthoritativeMatchIdentity({
        ...state,
        myTeam: { ...myTeam, id: opponentTeam.id },
      }),
    ).toBe(false);
    expect(
      hasAuthoritativeMatchIdentity({
        ...state,
        opponentTeam: { ...opponentTeam, id: myTeam.id },
      }),
    ).toBe(false);
  });

  it("only presents started lifecycle states on Timeline", () => {
    const state = {
      routeMatchId: match.id,
      match,
      myTeam,
      opponentTeam,
    };
    expect(hasAuthoritativeTimelineState(state)).toBe(false);
    expect(
      hasAuthoritativeTimelineState({
        ...state,
        match: { ...match, match_status: "WAITING_FOR_DECISION" },
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeTimelineState({
        ...state,
        match: { ...match, match_status: "IN_PROGRESS" },
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeTimelineState({
        ...state,
        match: { ...match, match_status: "HALFTIME" },
      }),
    ).toBe(true);
    expect(
      hasAuthoritativeTimelineState({
        ...state,
        match: { ...match, match_status: "FINISHED" },
      }),
    ).toBe(false);
  });

  it("only presents a complete authoritative Legend before kickoff", () => {
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
        match: { ...match, match_status: "IN_PROGRESS" },
      }),
    ).toBe(false);
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
