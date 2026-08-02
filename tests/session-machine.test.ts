import { describe, expect, it } from "vitest";

import { createMatchCommand } from "../src/match/api-v1/adapter";
import type {
  BackendMatch,
  BackendMatchResponse,
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
  it("models match creation as an idempotent command transition", () => {
    const command = createMatchCommand(
      "create",
      { my_team_id: "team_1", opponent_team_id: "team_2" },
      { idempotencyKey: "create-command" },
    );

    const creating = matchSessionReducer(createInitialMatchSession(), {
      type: "CREATE_REQUESTED",
      command,
    });

    expect(creating).toMatchObject({
      phase: "creating",
      route: "main",
      pendingCommand: command,
    });

    const duplicate = matchSessionReducer(creating, {
      type: "CREATE_REQUESTED",
      command,
    });
    expect(duplicate).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "idle",
      diagnostic: { kind: "illegal_transition" },
    });
  });

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
        expected: "timeline_playback",
        pending: null,
        participation: "NOT_PARTICIPATING",
      },
      {
        status: "IN_PROGRESS",
        expected: "timeline_playback",
        pending: null,
        participation: "PARTICIPATING",
      },
      {
        status: "IN_PROGRESS",
        expected: "legend_unavailable_simulation",
        pending: null,
        participation: "OBSERVING",
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

  it("models halftime resume and rejects unsolicited command responses", async () => {
    const teamFixture = await teams();
    const response = await readFixture<BackendMatchResponse>(
      "server/waiting-open-play-response.json",
    );
    const halftimeMatch: BackendMatch = {
      ...response.match,
      match_status: "HALFTIME",
      current_time: 45,
      prev_time: 45,
      pending_action: null,
    };
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: halftimeMatch,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });
    const command = createMatchCommand(
      "resume",
      { match_id: halftimeMatch.id },
      {
        matchId: halftimeMatch.id,
        revision: halftimeMatch.revision,
        idempotencyKey: "resume-command",
      },
    );
    state = matchSessionReducer(state, { type: "RESUME_REQUESTED", command });
    expect(state).toMatchObject({
      phase: "resuming",
      route: "timeline",
      pendingCommand: command,
    });

    state = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "resume",
      response: {
        ...response,
        match: {
          ...response.match,
          revision: halftimeMatch.revision + 1,
        },
      },
    });
    expect(state).toMatchObject({
      phase: "timeline_playback",
      pendingCommand: null,
    });

    const created = matchSessionReducer(createInitialMatchSession(), {
      type: "MATCH_CREATED",
      payload: {
        match: {
          ...response.match,
          match_status: "NOT_STARTED",
          pending_action: null,
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
      },
    });
    const unsolicited = matchSessionReducer(created, {
      type: "COMMAND_RESOLVED",
      source: "start",
      response,
    });
    expect(unsolicited).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "created",
      diagnostic: { kind: "illegal_transition" },
    });
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

    const cleared = matchSessionReducer(badScene, { type: "ERROR_CLEARED" });
    expect(cleared).toMatchObject({
      phase: "idle",
      recoveryPhase: null,
      diagnostic: null,
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

  it("rejects commands for another match or revision before transport", async () => {
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
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });

    const wrongMatch = createMatchCommand(
      "action",
      { match_id: "another-match", action_id: scene.id },
      {
        matchId: "another-match",
        revision: match.revision,
        actionId: scene.id,
      },
    );
    const rejectedMatch = matchSessionReducer(state, {
      type: "ACTION_REQUESTED",
      command: wrongMatch,
    });
    expect(rejectedMatch).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      diagnostic: { kind: "illegal_transition" },
    });

    const wrongRevision = createMatchCommand(
      "action",
      { match_id: match.id, action_id: scene.id },
      {
        matchId: match.id,
        revision: (match.revision ?? 0) + 1,
        actionId: scene.id,
      },
    );
    const rejectedRevision = matchSessionReducer(state, {
      type: "ACTION_REQUESTED",
      command: wrongRevision,
    });
    expect(rejectedRevision).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      diagnostic: { kind: "illegal_transition" },
    });
  });

  it("returns a cleared command error to the phase that can retry it", async () => {
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
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    const command = createMatchCommand(
      "action",
      { match_id: match.id, action_id: scene.id },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "ERROR_RECORDED",
      diagnostic: {
        kind: "network",
        message: "Connection interrupted.",
        retryable: true,
      },
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      pendingCommand: command,
    });

    state = matchSessionReducer(state, { type: "ERROR_CLEARED" });
    expect(state).toMatchObject({
      phase: "scene_ready",
      route: "field",
      recoveryPhase: null,
      pendingCommand: command,
      diagnostic: null,
    });
  });

  it("does not let same-revision hydration interrupt an in-flight command", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const createdMatch: BackendMatch = {
      ...matchForScene(scene),
      match_status: "NOT_STARTED",
      pending_action: null,
    };
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "MATCH_CREATED",
      payload: {
        match: createdMatch,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
      },
    });
    const command = createMatchCommand(
      "start",
      { match_id: createdMatch.id },
      {
        matchId: createdMatch.id,
        revision: createdMatch.revision,
        idempotencyKey: "start-in-flight",
      },
    );
    state = matchSessionReducer(state, { type: "START_REQUESTED", command });

    const hydrated = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: createdMatch,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });

    expect(hydrated).toBe(state);
    expect(hydrated).toMatchObject({
      phase: "starting",
      pendingCommand: command,
    });
  });

  it("accepts a newer hydrated lifecycle state when an in-flight command already applied", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const createdMatch: BackendMatch = {
      ...matchForScene(scene),
      match_status: "NOT_STARTED",
      pending_action: null,
    };
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "MATCH_CREATED",
      payload: {
        match: createdMatch,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
      },
    });
    const command = createMatchCommand(
      "start",
      { match_id: createdMatch.id },
      {
        matchId: createdMatch.id,
        revision: createdMatch.revision,
        idempotencyKey: "start-reconciled",
      },
    );
    state = matchSessionReducer(state, { type: "START_REQUESTED", command });

    const hydrated = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: {
          ...createdMatch,
          current_time: scene.minute,
          prev_time: 0,
          revision: createdMatch.revision + 1,
          match_status: "IN_PROGRESS",
          pending_action: null,
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });

    expect(hydrated).toMatchObject({
      phase: "timeline_playback",
      pendingCommand: null,
      match: { match_status: "IN_PROGRESS" },
    });
  });

  it("rejects a hydration payload that supplies a different pending action", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: { ...matchForScene(scene), pending_action: null },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
        pendingAction: scene,
      },
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      diagnostic: { kind: "contract" },
    });
  });

  it("diagnoses same-revision state drift without losing an action retry", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    let submitting = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
      },
    });
    submitting = matchSessionReducer(submitting, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    submitting = matchSessionReducer(submitting, { type: "SCENE_READY" });
    const command = createMatchCommand(
      "action",
      { match_id: match.id, action_id: scene.id },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
        idempotencyKey: "same-revision-retry",
      },
    );
    submitting = matchSessionReducer(submitting, {
      type: "ACTION_REQUESTED",
      command,
    });

    const changedStatus = matchSessionReducer(submitting, {
      type: "HYDRATED",
      payload: {
        match: {
          ...match,
          match_status: "IN_PROGRESS",
          pending_action: null,
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
        pendingAction: null,
      },
    });
    expect(changedStatus).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      pendingCommand: command,
      diagnostic: { kind: "contract" },
    });

    const movedOpponent = {
      ...scene,
      field_state: {
        ...scene.field_state!,
        opponent_positions: scene.field_state!.opponent_positions.map(
          (player, index) =>
            index === 0
              ? { ...player, x: Math.min(100, player.x + 1) }
              : player,
        ),
      },
    };
    const changedField = matchSessionReducer(submitting, {
      type: "HYDRATED",
      payload: {
        match: { ...match, pending_action: movedOpponent },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
        pendingAction: movedOpponent,
      },
    });
    expect(changedField).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      pendingCommand: command,
      diagnostic: { kind: "contract" },
    });
  });

  it("lets a newer authoritative revision supersede an in-flight action", async () => {
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
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    const command = createMatchCommand(
      "action",
      { match_id: match.id, action_id: scene.id },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: { ...match, revision: match.revision + 1 },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });

    expect(state).toMatchObject({
      phase: "timeline_playback",
      pendingCommand: null,
      diagnostic: null,
      match: { revision: match.revision + 1 },
    });
  });

  it("rejects inconsistent field authority and invalid advertised choices", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    const wrongField = {
      ...scene,
      field_state: { ...scene.field_state!, match_id: "another-match" },
    };
    const mismatched = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: { ...match, pending_action: wrongField },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });
    expect(mismatched).toMatchObject({
      phase: "recoverable_error",
      diagnostic: { kind: "contract" },
    });

    const wrongChoices = {
      ...scene,
      available_choices: [
        ...scene.available_choices,
        { ...scene.available_choices[0], id: "UNSUPPORTED" },
      ],
    };
    const invalidChoices = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: { ...match, pending_action: wrongChoices },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });
    expect(invalidChoices).toMatchObject({
      phase: "recoverable_error",
      diagnostic: { kind: "contract" },
    });
  });

  it("preserves the retry command when a command response violates the contract", async () => {
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
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    const command = createMatchCommand(
      "action",
      { match_id: match.id, action_id: scene.id },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
        idempotencyKey: "retry-after-contract-error",
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    const invalidPending = {
      ...scene,
      available_choices: [
        ...scene.available_choices,
        { ...scene.available_choices[0], id: "UNSUPPORTED" },
      ],
    };
    state = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "action",
      response: {
        minute: scene.minute,
        prev_time: scene.minute - 1,
        status: "WAITING_FOR_DECISION",
        pending_action: invalidPending,
        field_state: scene.field_state ?? null,
        action: scene.scene_type,
        action_team: scene.action_team,
        events: [],
        match: {
          ...match,
          revision: match.revision + 1,
          pending_action: invalidPending,
        },
      },
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      pendingCommand: command,
      diagnostic: { kind: "contract" },
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
