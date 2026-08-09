import { describe, expect, it } from "vitest";

import { createMatchCommand } from "../src/match/api-v1/adapter";
import type {
  BackendMatch,
  BackendMatchResponse,
  BackendMatchSnapshot,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
  BackendUnsupportedSceneRecovery,
} from "../src/match/api-v1/contract";
import {
  createInitialMatchSession,
  matchSessionReducer,
  SCENE_SUPPORT,
} from "../src/match/session-machine";
import { readFixture } from "./match-api-v1-fixtures";

const availableLifecycle = {
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
};

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
  it("hydrates only backend-confirmed active or scheduled tactics", async () => {
    const snapshot = await readFixture<BackendMatchSnapshot>(
      "server/match-snapshot-engine-7-response.json",
    );
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: snapshot.match,
        myTeam: snapshot.my_team,
        opponentTeam: snapshot.opponent_team,
        timelineEvents: snapshot.timeline,
        pendingAction: snapshot.pending_action,
        legendAvailability: snapshot.legend_availability,
      },
    });
    expect(state).toMatchObject({ effort: "medium", playstyle: "balanced" });

    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: {
          ...snapshot.match,
          revision: snapshot.match.revision + 1,
          scheduled_tactics: {
            version: 1,
            effective_minute: 1,
            command_sequence: 1,
            tactics: {
              version: 1,
              effort: "HIGH",
              playstyle: "OFFENSIVE",
            },
          },
        },
        myTeam: snapshot.my_team,
        opponentTeam: snapshot.opponent_team,
        timelineEvents: snapshot.timeline,
        pendingAction: snapshot.pending_action,
        legendAvailability: snapshot.legend_availability,
      },
    });
    expect(state).toMatchObject({ effort: "high", playstyle: "offensive" });
  });
  it("preserves the server-advertised recovery intent for an unknown future scene", async () => {
    const teamFixture = await teams();
    const knownAction =
      await readFixture<BackendPendingAction>("scenes/jumper.json");
    const action = structuredClone(knownAction);
    action.scene_type = "FUTURE_RANDOM_EVENT_V99";
    action.action_type = "FUTURE_RANDOM_EVENT_V99";
    action.available_choices = [
      {
        id: "CONTINUE_WITHOUT_EVENT",
        label: "Continue Without Event",
        description: "Skip unsupported event content without applying effects.",
        input_schema: {
          type: "object",
          required: ["choice"],
          allowed: ["choice"],
          additional_properties: false,
        },
      },
    ];
    const recovery: BackendUnsupportedSceneRecovery = {
      version: 1,
      status: "RECOVERY_REQUIRED",
      code: "UNSUPPORTED_SCENE_TYPE",
      scene_type: action.scene_type,
      contract_version: null,
      supported_contract_version: null,
      action_id: action.id,
      action_sequence: 4,
      minute: action.minute,
      recovery: {
        choice: "CONTINUE_WITHOUT_EVENT",
        label: "Continue Without Event",
        description: "Skip unsupported event content without applying effects.",
        input_schema: {
          type: "object",
          required: ["choice"],
          allowed: ["choice"],
          additional_properties: false,
        },
      },
    };
    const state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: {
          ...matchForScene(action),
          match_status: "WAITING_FOR_RECOVERY",
          pending_action: null,
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(action)],
        pendingAction: null,
        unsupportedScene: recovery,
      },
    });

    expect(state).toMatchObject({
      phase: "unsupported_recovery",
      route: "field",
      pendingAction: null,
      unsupportedScene: recovery,
    });
  });

  it("returns a successful no-effect recovery directly to timeline playback", async () => {
    const teamFixture = await teams();
    const knownAction =
      await readFixture<BackendPendingAction>("scenes/jumper.json");
    const action = {
      ...structuredClone(knownAction),
      action_type: "FUTURE_RANDOM_EVENT_V99",
      scene_type: "FUTURE_RANDOM_EVENT_V99",
    };
    const recovery: BackendUnsupportedSceneRecovery = {
      version: 1,
      status: "RECOVERY_REQUIRED",
      code: "UNSUPPORTED_SCENE_TYPE",
      scene_type: action.scene_type,
      contract_version: null,
      supported_contract_version: null,
      action_id: action.id,
      action_sequence: 4,
      minute: action.minute,
      recovery: {
        choice: "CONTINUE_WITHOUT_EVENT",
        label: "Continue Without Event",
        description: "Resume without applying an event outcome.",
        input_schema: {
          type: "object",
          required: ["choice"],
          allowed: ["choice"],
          additional_properties: false,
        },
      },
    };
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: {
          ...matchForScene(action),
          match_status: "WAITING_FOR_RECOVERY",
          pending_action: null,
        },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(action)],
        pendingAction: null,
        unsupportedScene: recovery,
      },
    });
    const command = createMatchCommand(
      "action",
      {
        match_id: state.match!.id,
        action_id: action.id,
        match_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
      },
      {
        matchId: state.match!.id,
        revision: state.match!.revision,
        actionId: action.id,
        idempotencyKey: "recover-future-scene",
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });

    const recovered = await readFixture<BackendMatchResponse>(
      "server/waiting-open-play-response.json",
    );
    const committedResponse: BackendMatchResponse = {
      ...recovered,
      minute: action.minute + 1,
      prev_time: action.minute,
      status: "IN_PROGRESS",
      pending_action: null,
      field_state: null,
      action: null,
      action_team: null,
      events: [eventFor(action)],
      pending_settlement_events: [],
      unsupported_scene: null,
      match: {
        ...recovered.match,
        id: state.match!.id,
        current_time: action.minute + 1,
        prev_time: action.minute,
        revision: state.match!.revision + 1,
        match_status: "IN_PROGRESS",
        pending_action: null,
      },
      latest_operation: {
        version: 1,
        operation_id: "receipt-recover-future-scene",
        operation: "processMatchAction",
        status: "COMMITTED",
        request_revision: command.revision,
        committed_revision: state.match!.revision + 1,
        action_id: action.id,
        playback: {
          version: 1,
          submitted_action: null,
          submitted_field_state: null,
          last_decision: {
            id: "decision-recover-future-scene",
            match_id: state.match!.id,
            sequence: 1,
            minute: action.minute,
            action: "RANDOM_EVENT",
            action_team: "NEUTRAL",
            action_id: action.id,
            action_version: 1,
            decision_version: 5,
            decision_data: {
              choice: "CONTINUE_WITHOUT_EVENT",
              unsupported_scene_type: action.scene_type,
            },
            field_state_id: action.field_state_id,
            timestamp: 1,
          },
          decision_result: {
            description: "Unsupported scene skipped without effects.",
            success: true,
            outcome_type: "SKIPPED_NO_EFFECT",
            immediate_effects: {},
            pending_settlement_events: [],
            unsupported_scene_recovery: {
              version: 1,
              status: "RECOVERED",
              outcome: "SKIPPED_NO_EFFECT",
              scene_type: action.scene_type,
              action_id: action.id,
              recovered_revision: state.match!.revision + 1,
            },
          },
          events: [eventFor(action)],
        },
      },
    };
    for (const invalidDecisionShape of [
      { action_team: "MY_TEAM" },
      { action_version: 2 },
      { decision_version: 1 },
    ] as const) {
      const invalidResponse = structuredClone(committedResponse);
      Object.assign(
        invalidResponse.latest_operation!.playback!.last_decision!,
        invalidDecisionShape,
      );
      const rejected = matchSessionReducer(state, {
        type: "COMMAND_RESOLVED",
        source: "action",
        command,
        response: invalidResponse,
      });
      expect(rejected).toMatchObject({
        phase: "recoverable_error",
        pendingCommand: command,
        diagnostic: { kind: "contract" },
      });
    }

    state = matchSessionReducer(state, {
      type: "COMMAND_RESOLVED",
      source: "action",
      command,
      response: committedResponse,
    });

    expect(state).toMatchObject({
      phase: "timeline_playback",
      route: "timeline",
      decisionResult: null,
      unsupportedScene: null,
      pendingCommand: null,
    });
  });

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
      participation?: BackendMatch["player_participation"];
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
      command,
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
    const unsolicitedCommand = createMatchCommand(
      "start",
      { match_id: created.match!.id },
      { matchId: created.match!.id, revision: created.match!.revision },
    );
    const unsolicited = matchSessionReducer(created, {
      type: "COMMAND_RESOLVED",
      source: "start",
      command: unsolicitedCommand,
      response,
    });
    expect(unsolicited).toBe(created);
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
      command,
      response: {
        minute: scene.minute,
        prev_time: scene.minute - 1,
        status: "WAITING_FOR_DECISION",
        pending_action: scene,
        field_state: scene.field_state ?? null,
        action: scene.scene_type,
        action_team: scene.action_team,
        events: [],
        pending_settlement_events: [],
        unsupported_scene: null,
        ...availableLifecycle,
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

  it("does not unlock an ambiguous command by clearing its error", async () => {
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
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      pendingCommand: command,
      retrySafe: false,
      diagnostic: { kind: "network" },
    });
  });

  it("allows an exact retry only when the API explicitly marks it safe", () => {
    const command = createMatchCommand(
      "start",
      { match_id: "match-retry-contract" },
      { matchId: "match-retry-contract", revision: 1 },
    );
    const pendingState = {
      ...createInitialMatchSession(),
      phase: "starting" as const,
      pendingCommand: command,
    };

    const explicitlyRetryable = matchSessionReducer(pendingState, {
      type: "ERROR_RECORDED",
      diagnostic: {
        kind: "network",
        message: "The server did not commit this command.",
        retryable: true,
        recoveryAction: "RETRY_SAME_REQUEST",
      },
    });
    expect(explicitlyRetryable).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "created",
      pendingCommand: command,
      retrySafe: true,
    });
    expect(
      matchSessionReducer(explicitlyRetryable, { type: "ERROR_CLEARED" }),
    ).toMatchObject({
      phase: "created",
      recoveryPhase: null,
      pendingCommand: command,
      diagnostic: null,
    });

    const ambiguous = matchSessionReducer(pendingState, {
      type: "ERROR_RECORDED",
      diagnostic: {
        kind: "network",
        message: "The connection was interrupted.",
        retryable: true,
        recoveryAction: "HYDRATE_MATCH",
      },
    });
    expect(ambiguous.retrySafe).toBe(false);
  });

  it("moves a detached in-flight command to hydration-first recovery", () => {
    const command = createMatchCommand(
      "resume",
      { match_id: "match-detached" },
      { matchId: "match-detached", revision: 4 },
    );
    const detached = matchSessionReducer(
      {
        ...createInitialMatchSession(),
        phase: "resuming",
        pendingCommand: command,
        retrySafe: true,
      },
      { type: "COMMAND_RECONCILIATION_REQUIRED", command },
    );

    expect(detached).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "halftime",
      pendingCommand: command,
      retrySafe: false,
      diagnostic: { recoveryAction: "HYDRATE_MATCH" },
    });
  });

  it("submits only the exact retained action from recoverable hydration", async () => {
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
      {
        match_id: match.id,
        action_id: scene.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: scene.id,
        idempotencyKey: "exact-recovery-command",
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "ERROR_RECORDED",
      diagnostic: {
        kind: "network",
        message: "The action response was interrupted.",
        retryable: true,
      },
    });
    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
        pendingAction: scene,
        latestOperation: null,
      },
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      retrySafe: true,
      pendingCommand: command,
      diagnostic: { recoveryAction: "RETRY_SAME_REQUEST" },
    });

    const retried = matchSessionReducer(state, {
      type: "ACTION_REQUESTED",
      command,
    });
    expect(retried).toMatchObject({
      phase: "submitting",
      retrySafe: false,
      pendingCommand: command,
    });

    const changedCommand = {
      ...command,
      payload: {
        ...command.payload,
        match_decision: { choice: "KICK", changed: true },
      },
    };
    const rejected = matchSessionReducer(state, {
      type: "ACTION_REQUESTED",
      command: changedCommand,
    });
    expect(rejected).toMatchObject({
      phase: "recoverable_error",
      pendingCommand: command,
      diagnostic: { kind: "illegal_transition" },
    });
  });

  it("turns a same-revision start hydration into an exact safe retry", async () => {
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

    expect(hydrated).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "created",
      retrySafe: true,
      pendingCommand: command,
      diagnostic: { recoveryAction: "RETRY_SAME_REQUEST" },
    });

    const retried = matchSessionReducer(hydrated, {
      type: "START_REQUESTED",
      command,
    });
    expect(retried).toMatchObject({
      phase: "starting",
      retrySafe: false,
      pendingCommand: command,
    });
  });

  it("turns a same-revision halftime hydration into an exact safe retry", async () => {
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
        idempotencyKey: "resume-in-flight",
      },
    );
    state = matchSessionReducer(state, { type: "RESUME_REQUESTED", command });

    const hydrated = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: halftimeMatch,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
      },
    });

    expect(hydrated).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "halftime",
      retrySafe: true,
      pendingCommand: command,
      diagnostic: { recoveryAction: "RETRY_SAME_REQUEST" },
    });

    const retried = matchSessionReducer(hydrated, {
      type: "RESUME_REQUESTED",
      command,
    });
    expect(retried).toMatchObject({
      phase: "resuming",
      retrySafe: false,
      pendingCommand: command,
    });
  });

  it("turns a same-revision action hydration into an exact safe retry", async () => {
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
        pendingAction: scene,
      },
    });
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: scene.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
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
        idempotencyKey: "action-in-flight",
      },
    );
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });

    const hydrated = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
        pendingAction: scene,
      },
    });

    expect(hydrated).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      retrySafe: true,
      pendingCommand: command,
      diagnostic: { recoveryAction: "RETRY_SAME_REQUEST" },
    });

    const retried = matchSessionReducer(hydrated, {
      type: "ACTION_REQUESTED",
      command,
    });
    expect(retried).toMatchObject({
      phase: "submitting",
      retrySafe: false,
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

  it("retains an ambiguous in-flight action when a newer snapshot has no receipt", async () => {
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
      phase: "recoverable_error",
      recoveryPhase: "timeline_playback",
      pendingCommand: command,
      retrySafe: false,
      diagnostic: { kind: "stale_command" },
      match: { revision: match.revision + 1 },
    });
  });

  it("ignores a delayed hydration snapshot from an older revision", async () => {
    const teamFixture = await teams();
    const scene = await readFixture<BackendPendingAction>(
      "scenes/open-play.json",
    );
    const match = matchForScene(scene);
    const current = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: { ...match, revision: match.revision + 2 },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [eventFor(scene)],
      },
    });

    const delayed = matchSessionReducer(current, {
      type: "HYDRATED",
      payload: {
        match: { ...match, revision: match.revision + 1 },
        myTeam: teamFixture.my_team,
        opponentTeam: teamFixture.opponent_team,
        timelineEvents: [],
        pendingAction: scene,
        latestOperation: null,
      },
    });

    expect(delayed).toBe(current);
    expect(delayed.match?.revision).toBe(match.revision + 2);
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
      command,
      response: {
        minute: scene.minute,
        prev_time: scene.minute - 1,
        status: "WAITING_FOR_DECISION",
        pending_action: invalidPending,
        field_state: scene.field_state ?? null,
        action: scene.scene_type,
        action_team: scene.action_team,
        events: [],
        pending_settlement_events: [],
        unsupported_scene: null,
        ...availableLifecycle,
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
