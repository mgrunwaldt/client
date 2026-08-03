import { describe, expect, it } from "vitest";

import { createMatchCommand } from "../src/match/api-v1/adapter";
import {
  type BackendMatchResponse,
  BackendMatchResponseSchema,
  type BackendMatchSnapshot,
  BackendMatchSnapshotSchema,
} from "../src/match/api-v1/contract";
import {
  createInitialMatchSession,
  matchSessionReducer,
} from "../src/match/session-machine";
import { readFixture } from "./match-api-v1-fixtures";

async function fixture<T>(name: string) {
  return readFixture<T>(`server/${name}.json`);
}

describe("M2-I6 authoritative match lifecycle", () => {
  it("hydrates the persisted halftime summary and resumes once from minute 46", async () => {
    const halftime = await fixture<BackendMatchResponse>("halftime-response");
    const startOfSecondHalf = await fixture<BackendMatchResponse>(
      "waiting-open-play-response",
    );
    const created = await fixture<{
      my_team: BackendMatchSnapshot["my_team"];
      opponent_team: BackendMatchSnapshot["opponent_team"];
    }>("create-match-response");
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: halftime.match,
        myTeam: created.my_team,
        opponentTeam: created.opponent_team,
        timelineEvents: halftime.events,
        pendingAction: halftime.pending_action,
        legendAvailability: halftime.legend_availability,
        halftimeSummary: halftime.halftime_summary,
        fullTimeHandoff: halftime.full_time_handoff,
      },
    });

    expect(state).toMatchObject({
      phase: "halftime",
      playbackStatus: "idle",
      halftimeSummary: { minute: 45, tactics_editable: false },
    });

    const command = createMatchCommand(
      "resume",
      { match_id: halftime.match.id },
      { matchId: halftime.match.id, revision: halftime.match.revision },
    );
    state = matchSessionReducer(state, { type: "RESUME_REQUESTED", command });
    expect(state.phase).toBe("resuming");

    const response = {
      ...startOfSecondHalf,
      minute: 46,
      prev_time: 45,
      status: "IN_PROGRESS",
      pending_action: null,
      field_state: null,
      action: "RESUME_MATCH",
      action_team: "NEUTRAL" as const,
      events: [
        {
          ...startOfSecondHalf.events[0],
          event_id: 46,
          minute: 46,
          action: "RESUME_MATCH",
          team: "NEUTRAL" as const,
          description: "Second half resumed.",
        },
      ],
      match: {
        ...startOfSecondHalf.match,
        id: halftime.match.id,
        revision: halftime.match.revision + 1,
        current_time: 46,
        prev_time: 45,
        match_status: "IN_PROGRESS",
        pending_action: null,
      },
      legend_availability: halftime.legend_availability,
      halftime_summary: halftime.halftime_summary,
      full_time_handoff: null,
    } as BackendMatchResponse;
    state = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "resume",
      response,
    });

    expect(state).toMatchObject({
      phase: "timeline_playback",
      playbackMinute: 45,
      pendingCommand: null,
    });
    expect(state.timelineEvents.at(-1)).toMatchObject({
      minute: 46,
      action: "RESUME_MATCH",
    });
  });

  it.each(["SUBSTITUTED", "INJURED", "EXPELLED"] as const)(
    "simulates the remaining timeline for an unavailable %s Legend without controls",
    async (status) => {
      const fulltime = await fixture<BackendMatchResponse>("fulltime-response");
      const unavailable = {
        ...fulltime.legend_availability,
        status,
        availability: "UNAVAILABLE" as const,
        participation: "OBSERVING" as const,
        interactive_controls: false,
        unavailable_since_minute: 60,
      };
      const starting = {
        ...createInitialMatchSession(),
        phase: "result_playback" as const,
        match: {
          ...fulltime.match,
          player_participation: "OBSERVING" as const,
          prev_time: 60,
        },
        playbackMinute: 60,
        legendAvailability: unavailable,
      };
      let state = matchSessionReducer(starting, {
        type: "RESULT_ACKNOWLEDGED",
      });
      expect(state).toMatchObject({
        phase: "legend_unavailable_simulation",
        playbackStatus: "timeline_playing",
        legendAvailability: { interactive_controls: false, status },
      });
      state = matchSessionReducer(state, { type: "TIMELINE_TICK", minute: 90 });
      expect(state.playbackMinute).toBe(90);
      expect(state.pendingAction).toBeNull();
    },
  );

  it("uses Legend availability when match participation is omitted", async () => {
    const fulltime = await fixture<BackendMatchResponse>("fulltime-response");
    const created = await fixture<{
      my_team: BackendMatchSnapshot["my_team"];
      opponent_team: BackendMatchSnapshot["opponent_team"];
    }>("create-match-response");
    const unavailable = {
      ...fulltime.legend_availability,
      status: "SUBSTITUTED" as const,
      availability: "UNAVAILABLE" as const,
      participation: "OBSERVING" as const,
      interactive_controls: false,
      unavailable_since_minute: 60,
    };
    const match = {
      ...fulltime.match,
      match_status: "IN_PROGRESS",
      current_time: 90,
      prev_time: 60,
      player_participation: undefined,
    };

    const state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: created.my_team,
        opponentTeam: created.opponent_team,
        timelineEvents: fulltime.events,
        legendAvailability: unavailable,
      },
    });

    expect(state).toMatchObject({
      phase: "legend_unavailable_simulation",
      playbackMinute: 60,
      legendAvailability: { interactive_controls: false },
    });
  });

  it("enters observed simulation when a halftime resume finishes after Legend removal", async () => {
    const halftime = await fixture<BackendMatchResponse>("halftime-response");
    const fulltime = await fixture<BackendMatchResponse>("fulltime-response");
    const created = await fixture<{
      my_team: BackendMatchSnapshot["my_team"];
      opponent_team: BackendMatchSnapshot["opponent_team"];
    }>("create-match-response");
    const unavailable = {
      ...fulltime.legend_availability,
      status: "INJURED" as const,
      availability: "UNAVAILABLE" as const,
      participation: "OBSERVING" as const,
      interactive_controls: false,
      unavailable_since_minute: 89,
    };
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: halftime.match,
        myTeam: created.my_team,
        opponentTeam: created.opponent_team,
        timelineEvents: halftime.events,
        legendAvailability: halftime.legend_availability,
        halftimeSummary: halftime.halftime_summary,
        fullTimeHandoff: null,
      },
    });
    const command = createMatchCommand(
      "resume",
      { match_id: halftime.match.id },
      { matchId: halftime.match.id, revision: halftime.match.revision },
    );
    state = matchSessionReducer(state, { type: "RESUME_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "resume",
      response: {
        ...fulltime,
        prev_time: 89,
        match: {
          ...fulltime.match,
          revision: halftime.match.revision + 1,
          prev_time: 89,
          player_participation: "OBSERVING" as const,
        },
        legend_availability: unavailable,
      },
    });
    expect(state).toMatchObject({
      phase: "legend_unavailable_simulation",
      playbackMinute: 89,
      playbackStatus: "timeline_playing",
    });
    state = matchSessionReducer(state, { type: "TIMELINE_TICK", minute: 90 });
    expect(state).toMatchObject({ phase: "finished", playbackMinute: 90 });
  });

  it("accepts the backend terminal handoff without deriving outcome or settlement time", async () => {
    const fulltime = await fixture<BackendMatchResponse>("fulltime-response");
    const response = structuredClone(fulltime);
    if (!response.full_time_handoff)
      throw new Error("missing full-time fixture");
    response.full_time_handoff.result = "NO_CONTEST";
    response.full_time_handoff.season_points_delta = null;
    response.full_time_handoff.pending_settlement_events[0].created_time = {
      match_minute: 0,
      decision_sequence: 0,
    };
    response.full_time_handoff.key_events[0].minute = 0;

    expect(BackendMatchResponseSchema.safeParse(response).success).toBe(true);
    expect(
      BackendMatchSnapshotSchema.safeParse(
        await fixture("match-snapshot-response"),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown participation states and empty key-event descriptions", async () => {
    const fulltime = await fixture<BackendMatchResponse>("fulltime-response");
    const unknownParticipation = structuredClone(fulltime) as unknown as {
      legend_availability: { participation: string };
    };
    unknownParticipation.legend_availability.participation = "BENCHED";
    expect(
      BackendMatchResponseSchema.safeParse(unknownParticipation).success,
    ).toBe(false);

    const inconsistentParticipation = structuredClone(fulltime);
    inconsistentParticipation.match.player_participation = "PARTICIPATING";
    inconsistentParticipation.legend_availability.participation =
      "NOT_PARTICIPATING";
    expect(
      BackendMatchResponseSchema.safeParse(inconsistentParticipation).success,
    ).toBe(false);

    const emptyDescription = structuredClone(fulltime);
    if (!emptyDescription.full_time_handoff) {
      throw new Error("missing full-time fixture");
    }
    emptyDescription.full_time_handoff.key_events[0].description = "   ";
    expect(BackendMatchResponseSchema.safeParse(emptyDescription).success).toBe(
      false,
    );
  });

  it.each([
    ["WIN", 3, 2, 1],
    ["DRAW", 1, 1, 1],
    ["LOSS", -1, 0, 2],
  ] as const)(
    "accepts the authoritative %s season-point handoff",
    async (result, points, myScore, opponentScore) => {
      const response = await fixture<BackendMatchResponse>("fulltime-response");
      if (!response.full_time_handoff)
        throw new Error("missing full-time fixture");
      response.match.my_team_score = myScore;
      response.match.opponent_team_score = opponentScore;
      response.full_time_handoff.final_score = {
        my_team: myScore,
        opponent_team: opponentScore,
      };
      response.full_time_handoff.result = result;
      response.full_time_handoff.season_points_delta = points;

      expect(BackendMatchResponseSchema.safeParse(response).success).toBe(true);
    },
  );

  it.each([
    ["MY_TEAM", "ADMINISTRATIVE_0_3", false, 0, 3, "LOSS", -1],
    ["MY_TEAM", "RESULT_PRESERVED_WORSE", false, 1, 5, "LOSS", -1],
    ["OPPONENT_TEAM", "ADMINISTRATIVE_0_3", false, 3, 0, "WIN", 3],
    ["OPPONENT_TEAM", "RESULT_PRESERVED_WORSE", false, 5, 1, "WIN", 3],
    ["BOTH", "ABANDONED_NO_CONTEST", true, 2, 4, "NO_CONTEST", null],
  ] as const)(
    "accepts the authoritative %s / %s administrative contribution",
    async (
      responsibleSide,
      disposition,
      noContest,
      myScore,
      opponentScore,
      result,
      points,
    ) => {
      const response = await fixture<BackendMatchResponse>("fulltime-response");
      if (!response.full_time_handoff)
        throw new Error("missing full-time fixture");
      const administrativeResult = {
        version: 1 as const,
        responsible_side: responsibleSide,
        minute: 72,
        score_before: { my_team: 1, opponent_team: 1 },
        score_after: { my_team: myScore, opponent_team: opponentScore },
        disposition,
        no_contest: noContest,
      };
      response.match.my_team_score = myScore;
      response.match.opponent_team_score = opponentScore;
      response.full_time_handoff.status = "ABANDONED";
      response.full_time_handoff.terminal_reason = "ADMINISTRATIVE";
      response.full_time_handoff.final_score = administrativeResult.score_after;
      response.full_time_handoff.result = result;
      response.full_time_handoff.season_points_delta = points;
      response.full_time_handoff.administrative_result = administrativeResult;
      response.full_time_handoff.legend_contribution.administrative_result =
        administrativeResult;

      const parsed = BackendMatchResponseSchema.safeParse(response);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(
          parsed.data.full_time_handoff?.legend_contribution
            .administrative_result,
        ).toEqual(administrativeResult);
      }
    },
  );
});
