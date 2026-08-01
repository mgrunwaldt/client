import { describe, expect, it } from "vitest";

import { createMatchCommand } from "../src/match/api-v1/adapter";
import type {
  BackendMatch,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
} from "../src/match/api-v1/contract";
import {
  createInitialMatchSession,
  matchSessionReducer,
  SCENE_SUPPORT,
} from "../src/match/session-machine";
import { readFixture } from "./match-api-v1-fixtures";

const sceneFiles = [
  "argument-opponent",
  "argument-teammate",
  "bathroom",
  "brawl",
  "corner",
  "dribble",
  "free-kick",
  "jumper",
  "open-play",
  "penalty",
] as const;

function matchForScene(scene: BackendPendingAction): BackendMatch {
  return {
    id: "match-fixture-1",
    my_team_id: "team_1",
    opponent_team_id: "team_2",
    my_team_score: 0,
    opponent_team_score: 0,
    current_time: scene.minute,
    prev_time: Math.max(0, scene.minute - 1),
    revision: 7,
    match_status: "WAITING_FOR_DECISION",
    pending_action: scene,
  };
}

function eventFor(scene: BackendPendingAction): BackendTimelineEvent {
  return {
    match_id: "match-fixture-1",
    event_id: 1,
    action: scene.scene_type,
    minute: scene.minute,
    team: scene.action_team,
    description: scene.description,
    my_team_score: 0,
    opponent_team_score: 0,
    my_team_scored: false,
    opponent_team_scored: false,
    player_participates: true,
  };
}

async function teams() {
  return readFixture<{
    my_team: BackendTeam;
    opponent_team: BackendTeam;
  }>("server/create-match-response.json");
}

describe("match session reducer", () => {
  it("maps all ten advertised scenes to a single safe field state", async () => {
    const teamFixture = await teams();

    for (const file of sceneFiles) {
      const scene = await readFixture<BackendPendingAction>(
        `scenes/${file}.json`,
      );
      const match = matchForScene(scene);
      let state = matchSessionReducer(createInitialMatchSession(), {
        type: "HYDRATED",
        payload: {
          match,
          myTeam: teamFixture.my_team,
          opponentTeam: teamFixture.opponent_team,
          timelineEvents: [eventFor(scene)],
        },
      });

      expect(state.phase, scene.scene_type).toBe("timeline_playback");
      expect(state.route, scene.scene_type).toBe("timeline");
      expect(state.pendingAction?.scene_type, scene.scene_type).toBe(
        scene.scene_type,
      );
      expect(
        SCENE_SUPPORT[scene.scene_type as keyof typeof SCENE_SUPPORT],
      ).toEqual(scene.available_choices.map((choice) => choice.id));

      state = matchSessionReducer(state, {
        type: "TIMELINE_TICK",
        minute: scene.minute,
      });
      state = matchSessionReducer(state, { type: "SCENE_READY" });
      expect(state.phase, scene.scene_type).toBe("scene_ready");
      expect(state.route, scene.scene_type).toBe("field");
    }
  });

  it("maps every lifecycle status without allowing the route to author it", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const waitingMatch = matchForScene(scene);
    const fixtures: Array<{
      status: BackendMatch["match_status"];
      expected: string;
      pending: BackendPendingAction | null;
      participation?: string;
    }> = [
      { status: "NOT_STARTED", expected: "created", pending: null },
      { status: "IN_PROGRESS", expected: "timeline_playback", pending: null },
      {
        status: "IN_PROGRESS",
        expected: "legend_unavailable_simulation",
        pending: null,
        participation: "NOT_PARTICIPATING",
      },
      { status: "HALFTIME", expected: "halftime", pending: null },
      { status: "FINISHED", expected: "finished", pending: null },
    ];

    for (const fixture of fixtures) {
      const state = matchSessionReducer(createInitialMatchSession(), {
        type: "HYDRATED",
        payload: {
          match: {
            ...waitingMatch,
            match_status: fixture.status,
            pending_action: fixture.pending,
            player_participation: fixture.participation,
          },
          myTeam: teamFixture.my_team,
          opponentTeam: teamFixture.opponent_team,
          timelineEvents: [],
          pendingAction: fixture.pending,
        },
      });
      expect(state.phase, fixture.status).toBe(fixture.expected);
    }
  });

  it("contains unknown API states in a recoverable diagnostic instead of routing a blank screen", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    const badStatus = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: { ...match, match_status: "FUTURE_STATUS" },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });
    expect(badStatus).toMatchObject({
      phase: "unsupported_contract",
      diagnostic: { kind: "unsupported_status" },
    });

    const badScene = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: {
          ...match,
          pending_action: { ...scene, scene_type: "FUTURE_SCENE" },
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });
    expect(badScene).toMatchObject({
      phase: "unsupported_contract",
      diagnostic: { kind: "unsupported_scene" },
    });
  });

  it("rejects stale commands and ignores a duplicate idempotency key safely", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    const command = createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: scene.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
        idempotencyKey: "one-command",
      },
    );
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
      },
    });
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    expect(state.phase).toBe("submitting");

    const duplicate = matchSessionReducer(state, {
      type: "COMMAND_RETAINED",
      command,
    });
    expect(duplicate).toBe(state);

    const stale = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "action",
      response: {
        minute: scene.minute,
        prev_time: scene.minute - 1,
        status: "WAITING_FOR_DECISION",
        pending_action: scene,
        field_state: scene.field_state ?? null,
        action: scene.scene_type,
        action_team: scene.action_team,
        events: [],
        match: { ...match, revision: (match.revision ?? 0) - 1 },
      },
    });
    expect(stale).toMatchObject({
      phase: "recoverable_error",
      diagnostic: { kind: "stale_command" },
    });
  });

  it("never derives authoritative match ownership, score, result, or follow-up data", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
      },
    });
    const authoritativeMatch = state.match;
    const authoritativeField = state.fieldState;
    const authoritativeAction = state.pendingAction;

    state = matchSessionReducer(state, { type: "TIMELINE_TICK", minute: 90 });
    state = matchSessionReducer(state, { type: "SCENE_READY" });

    expect(state.match).toBe(authoritativeMatch);
    expect(state.fieldState).toBe(authoritativeField);
    expect(state.pendingAction).toBe(authoritativeAction);
    expect(state.match?.my_team_score).toBe(0);
    expect(state.match?.opponent_team_score).toBe(0);
    expect(state.decisionResult).toBeNull();
  });
});
