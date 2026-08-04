import { beforeEach, describe, expect, it } from "vitest";

import type {
  BackendActionTeam,
  BackendFieldState,
  BackendMatch,
  BackendMatchResponse,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
} from "../src/lib/backend-match";
import { createMatchCommand } from "../src/lib/backend-match";
import { MatchApiContractError } from "../src/match/api-v1/errors";
import { useMatchSessionStore } from "../src/match/session-store";
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

interface SceneFixture extends BackendPendingAction {
  scene_type: string;
  field_state: BackendFieldState;
  origin?: { previous_action_id: string; previous_outcome: string } | null;
}

interface CreateMatchFixture {
  my_team: BackendTeam;
  opponent_team: BackendTeam;
}

interface ProgressFixture extends BackendMatchResponse {
  match: BackendMatch;
}

interface SelfPassResponse extends BackendMatchResponse {
  pending_action: BackendPendingAction & {
    field_state: BackendFieldState;
    origin: {
      previous_action_id: string;
      previous_outcome: string;
    };
  };
}

function eventFor(scene: SceneFixture, eventId: number): BackendTimelineEvent {
  return {
    match_id: "match-fixture-1",
    event_id: eventId,
    action: scene.scene_type,
    minute: scene.minute,
    team: scene.action_team as BackendActionTeam,
    description: scene.description,
    my_team_score: 0,
    opponent_team_score: 0,
    my_team_scored: false,
    opponent_team_scored: false,
    player_participates: true,
  };
}

function responseForScene(
  scene: SceneFixture,
  eventId: number,
): BackendMatchResponse {
  const match: BackendMatch = {
    id: "match-fixture-1",
    my_team_id: "team_1",
    opponent_team_id: "team_2",
    my_team_score: 0,
    opponent_team_score: 0,
    current_time: scene.minute,
    prev_time: 0,
    revision: 0,
    match_status: "WAITING_FOR_DECISION",
    pending_action: scene,
  };

  return {
    minute: scene.minute,
    status: "WAITING_FOR_DECISION",
    prev_time: Math.max(0, scene.minute - 1),
    pending_action: scene,
    field_state: scene.field_state,
    action: scene.scene_type,
    action_team: scene.action_team as BackendActionTeam,
    events: [eventFor(scene, eventId)],
    pending_settlement_events: [],
    unsupported_scene: null,
    ...availableLifecycle,
    match,
  };
}

describe("match session store hydration", () => {
  beforeEach(() => {
    useMatchSessionStore.getState().resetMatchSession();
  });

  it("releases only the hydration loader generation that started it", () => {
    const first = useMatchSessionStore.getState().beginHydrationLoading();
    const second = useMatchSessionStore.getState().beginHydrationLoading();

    useMatchSessionStore.getState().finishHydrationLoading(first);
    expect(useMatchSessionStore.getState().loading).toBe(true);

    useMatchSessionStore.getState().finishHydrationLoading(second);
    expect(useMatchSessionStore.getState().loading).toBe(false);
  });

  it("does not let cancelled hydration clear a newer command loader", () => {
    const hydration = useMatchSessionStore.getState().beginHydrationLoading();

    useMatchSessionStore.getState().setLoading(true);
    useMatchSessionStore.getState().finishHydrationLoading(hydration);

    expect(useMatchSessionStore.getState().loading).toBe(true);
  });

  it("retains an abandoned request for hydration without leaving global loading active", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    const createdMatch = {
      ...response.match,
      match_status: "NOT_STARTED" as const,
      pending_action: null,
    };
    useMatchSessionStore.getState().setCreatedMatch({
      match: createdMatch,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
    });
    const command = createMatchCommand(
      "start",
      { match_id: createdMatch.id },
      { matchId: createdMatch.id, revision: createdMatch.revision },
    );

    expect(useMatchSessionStore.getState().beginStartCommand(command)).toBe(
      true,
    );
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "starting",
      loading: true,
    });

    useMatchSessionStore.getState().requireCommandReconciliation(command);
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "created",
      pendingCommand: command,
      retrySafe: false,
      loading: false,
      diagnostic: { recoveryAction: "HYDRATE_MATCH" },
    });

    useMatchSessionStore.getState().setError(null);
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "recoverable_error",
      pendingCommand: command,
      retrySafe: false,
    });
  });

  it("hydrates all ten canonical playable scenes with a consistent minute", async () => {
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
    ];
    const scenes = await Promise.all(
      sceneFiles.map((name) =>
        readFixture<SceneFixture>(`scenes/${name}.json`),
      ),
    );
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );

    for (const scene of scenes) {
      useMatchSessionStore.getState().resetMatchSession();
      const response = responseForScene(scene, scene.minute);
      useMatchSessionStore.getState().hydrateMatchSession({
        match: response.match,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: response.events,
      });

      const state = useMatchSessionStore.getState();
      expect(scene.field_state.minute, scene.scene_type).toBe(scene.minute);
      expect(state.match?.current_time, scene.scene_type).toBe(scene.minute);
      expect(state.pendingAction?.scene_type, scene.scene_type).toBe(
        scene.scene_type,
      );
      expect(state.fieldState?.id, scene.scene_type).toBe(scene.field_state_id);
      expect(state.playbackMinute, scene.scene_type).toBe(0);
      expect(state.playbackStatus, scene.scene_type).toBe("timeline_playing");
    }
  });

  it("retains authoritative Legend data through create and snapshot hydration", async () => {
    const created = await readFixture<{
      match: BackendMatch;
      my_team: BackendTeam;
      opponent_team: BackendTeam;
    }>("server/create-match-response.json");
    const match = {
      ...created.match,
      legend_player_id: "legend-authoritative-7",
      legend_profile: {
        ...created.match.legend_profile!,
        stamina: 63,
        energy: 41,
      },
    };

    useMatchSessionStore.getState().setCreatedMatch({
      match,
      myTeam: created.my_team,
      opponentTeam: created.opponent_team,
    });
    expect(useMatchSessionStore.getState().match).toMatchObject({
      legend_player_id: "legend-authoritative-7",
      legend_profile: { stamina: 63, energy: 41 },
    });

    useMatchSessionStore.getState().resetMatchSession();
    useMatchSessionStore.getState().hydrateMatchSession({
      match,
      myTeam: created.my_team,
      opponentTeam: created.opponent_team,
      timelineEvents: [],
    });
    expect(useMatchSessionStore.getState().match).toMatchObject({
      legend_player_id: "legend-authoritative-7",
      legend_profile: { stamina: 63, energy: 41 },
    });
  });

  it("starts every newly hydrated waiting match from the authoritative timeline cursor", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    useMatchSessionStore.getState().setCreatedMatch({
      match: {
        ...response.match,
        id: "previous-match",
        match_status: "NOT_STARTED",
      },
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
    });
    useMatchSessionStore.getState().setPlaybackMinute(37);

    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
    });

    expect(useMatchSessionStore.getState()).toMatchObject({
      playbackMinute: 0,
      playbackStatus: "timeline_playing",
      pendingAction: { id: scene.id },
      phase: "timeline_playback",
    });
  });

  it("preserves same-match timeline playback but restarts after a scene becomes ready", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
    });
    useMatchSessionStore.getState().setPlaybackMinute(7);
    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
    });
    expect(useMatchSessionStore.getState()).toMatchObject({
      playbackMinute: 7,
      playbackStatus: "timeline_playing",
    });

    useMatchSessionStore.getState().setPlaybackMinute(response.minute);
    useMatchSessionStore.getState().markSceneReady();
    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
    });
    expect(useMatchSessionStore.getState()).toMatchObject({
      playbackMinute: 0,
      phase: "timeline_playback",
    });
  });

  it("rejects WAITING_FOR_DECISION without a pending action and falls back only for undefined", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);

    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
      pendingAction: null,
    });
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "recoverable_error",
      diagnostic: { kind: "contract" },
      pendingAction: null,
      fieldState: null,
      playbackStatus: "idle",
    });

    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
      pendingAction: undefined,
    });
    expect(useMatchSessionStore.getState()).toMatchObject({
      match: { pending_action: { id: scene.id } },
      pendingAction: { id: scene.id },
      fieldState: { id: scene.field_state_id },
      playbackMinute: 0,
      playbackStatus: "timeline_playing",
    });
  });

  it("clears active field state when the same singleton hydrates halftime and fulltime", async () => {
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const [waiting, ...lifecycle] = await Promise.all([
      readFixture<ProgressFixture>("server/waiting-open-play-response.json"),
      readFixture<ProgressFixture>("server/halftime-response.json"),
      readFixture<ProgressFixture>("server/fulltime-response.json"),
    ]);

    useMatchSessionStore.getState().hydrateMatchSession({
      match: waiting.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: waiting.events,
      pendingAction: waiting.pending_action,
    });
    useMatchSessionStore.getState().setPlaybackMinute(waiting.minute);
    useMatchSessionStore.getState().markSceneReady();
    expect(useMatchSessionStore.getState().pendingAction).not.toBeNull();
    expect(useMatchSessionStore.getState().fieldState).not.toBeNull();

    for (const response of lifecycle) {
      useMatchSessionStore.getState().hydrateMatchSession({
        match: response.match,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: response.events,
      });

      const state = useMatchSessionStore.getState();
      expect(state.match?.match_status).toBe(response.status);
      expect(state.match?.current_time).toBe(response.minute);
      expect(state.pendingAction).toBeNull();
      expect(state.fieldState).toBeNull();
      expect(state.playbackMinute).toBe(response.minute);
      expect(state.playbackStatus).toBe("idle");
      expect(state.phase).toBe(
        response.status === "HALFTIME" ? "halftime" : "finished",
      );
    }
  });

  it("applies response status and clears the pending action at lifecycle stops", async () => {
    const waiting = await readFixture<ProgressFixture>(
      "server/waiting-open-play-response.json",
    );
    const halftime = await readFixture<ProgressFixture>(
      "server/halftime-response.json",
    );
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );

    useMatchSessionStore.getState().setCreatedMatch({
      match: {
        ...waiting.match,
        match_status: "NOT_STARTED",
        pending_action: null,
      },
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
    });
    const startCommand = createMatchCommand(
      "start",
      { match_id: waiting.match.id },
      {
        matchId: waiting.match.id,
        revision: waiting.match.revision,
      },
    );
    useMatchSessionStore.getState().beginStartCommand(startCommand);
    useMatchSessionStore.getState().setStartResponse(waiting, startCommand);
    expect(useMatchSessionStore.getState()).toMatchObject({
      pendingAction: { scene_type: "OPEN_PLAY" },
      playbackMinute: 0,
      playbackStatus: "timeline_playing",
    });

    useMatchSessionStore.getState().setPlaybackMinute(waiting.minute);
    useMatchSessionStore.getState().markSceneReady();
    const actionCommand = createMatchCommand(
      "action",
      {
        match_id: waiting.match.id,
        action_id: waiting.pending_action?.id,
        match_decision: {},
      },
      {
        matchId: waiting.match.id,
        revision: waiting.match.revision,
        actionId: waiting.pending_action?.id ?? null,
      },
    );
    useMatchSessionStore.getState().beginActionCommand(actionCommand);
    useMatchSessionStore.getState().setActionResponse(
      {
        ...halftime,
        decision_result: {
          description: "The action resolves before half-time.",
          success: true,
          outcome_type: "BALL_LOST",
          immediate_effects: {},
          pending_settlement_events: [],
        },
        latest_operation: {
          version: 1,
          operation_id: "receipt-halftime-action",
          operation: "processMatchAction",
          status: "COMMITTED",
          request_revision: actionCommand.revision,
          committed_revision: halftime.match.revision,
          action_id: actionCommand.actionId,
          playback: {
            version: 1,
            submitted_action: waiting.pending_action,
            submitted_field_state: waiting.field_state,
            last_decision: {
              id: "decision-halftime-action",
              match_id: waiting.match.id,
              sequence: 1,
              minute: waiting.minute,
              action: waiting.pending_action!.scene_type,
              action_team: waiting.pending_action!.action_team,
              action_id: waiting.pending_action!.id,
              action_version: waiting.pending_action!.contract_version,
              decision_version: 1,
              decision_data: {},
              field_state_id: waiting.pending_action!.field_state_id,
              timestamp: 1,
            },
            decision_result: {
              description: "The action resolves before half-time.",
              success: true,
              outcome_type: "BALL_LOST",
              immediate_effects: {},
              pending_settlement_events: [],
            },
            events: halftime.events,
          },
        },
      },
      actionCommand,
    );
    expect(useMatchSessionStore.getState()).toMatchObject({
      pendingAction: null,
      fieldState: null,
      playbackMinute: 12,
      playbackStatus: "field_ready",
      phase: "result_playback",
    });
  });

  it("uses the authoritative top-level field state when the action omits its embedded copy", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    const pendingWithoutField = { ...scene, field_state: undefined };
    response.pending_action = pendingWithoutField;
    response.match = {
      ...response.match,
      pending_action: pendingWithoutField,
    };

    useMatchSessionStore.getState().setCreatedMatch({
      match: {
        ...response.match,
        match_status: "NOT_STARTED",
        pending_action: null,
      },
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
    });
    const command = createMatchCommand(
      "start",
      { match_id: response.match.id },
      {
        matchId: response.match.id,
        revision: response.match.revision,
      },
    );
    useMatchSessionStore.getState().beginStartCommand(command);
    useMatchSessionStore.getState().setStartResponse(response, command);

    expect(useMatchSessionStore.getState()).toMatchObject({
      pendingAction: { field_state: { id: scene.field_state.id } },
      fieldState: { id: scene.field_state.id },
    });
  });

  it("hydrates the frozen server self-pass follow-up response without rewriting it", async () => {
    const selfPass = await readFixture<SelfPassResponse>(
      "../reproductions/self-pass-follow-up-response.json",
    );
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );

    useMatchSessionStore.getState().setCreatedMatch({
      match: selfPass.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
    });
    useMatchSessionStore.getState().hydrateMatchSession({
      match: selfPass.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: selfPass.events,
      pendingAction: selfPass.pending_action,
    });

    const state = useMatchSessionStore.getState();
    expect(state.pendingAction?.id).toBe(selfPass.pending_action.id);
    expect(state.fieldState?.id).toBe(selfPass.pending_action.field_state_id);
    expect(state.fieldState?.carrier_player_id).toBe(
      selfPass.pending_action.field_state.legend_player_id,
    );
    expect(selfPass.pending_action.origin.previous_outcome).toBe(
      "KICK_TO_BETTER_OPEN_PLAY",
    );
    expect(state.timelineEvents.map((event) => event.event_id)).toEqual([1, 2]);
    expect(state.timelineEvents.map((event) => event.minute)).toEqual([12, 12]);
  });

  it("preserves an ambiguous command across a reconnect to the same action", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teams = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    const command = createMatchCommand(
      "action",
      {
        match_id: response.match.id,
        action_id: scene.id,
        match_decision: { choice: "KICK", power: 42 },
      },
      {
        matchId: response.match.id,
        actionId: scene.id,
        revision: response.match.revision,
        idempotencyKey: "reconnect-key",
      },
    );

    useMatchSessionStore.getState().retainPendingCommand(command);
    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teams.my_team,
      opponentTeam: teams.opponent_team,
      timelineEvents: response.events,
    });

    expect(useMatchSessionStore.getState().pendingCommand).toEqual(command);
  });

  it("enters creating before the create request is sent", () => {
    const command = createMatchCommand(
      "create",
      { my_team_id: "team_1", opponent_team_id: "team_2" },
      { idempotencyKey: "create-key" },
    );

    useMatchSessionStore.getState().beginCreateCommand(command);

    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "creating",
      loading: true,
      pendingCommand: command,
    });
  });

  it("returns false when a command guard rejects transport dispatch", () => {
    const command = createMatchCommand(
      "action",
      { match_id: "stale-match", action_id: "stale-action" },
      {
        matchId: "stale-match",
        revision: 1,
        actionId: "stale-action",
      },
    );

    expect(useMatchSessionStore.getState().beginActionCommand(command)).toBe(
      false,
    );
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "recoverable_error",
      loading: false,
      diagnostic: { kind: "illegal_transition" },
    });
  });

  it("ignores a delayed action response after the active session is reset", async () => {
    const scene = await readFixture<SceneFixture>("scenes/open-play.json");
    const teamFixture = await readFixture<CreateMatchFixture>(
      "server/create-match-response.json",
    );
    const response = responseForScene(scene, 1);
    const command = createMatchCommand(
      "action",
      {
        match_id: response.match.id,
        action_id: scene.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: response.match.id,
        revision: response.match.revision,
        actionId: scene.id,
        idempotencyKey: "late-action-after-reset",
      },
    );

    useMatchSessionStore.getState().hydrateMatchSession({
      match: response.match,
      myTeam: teamFixture.my_team,
      opponentTeam: teamFixture.opponent_team,
      timelineEvents: response.events,
    });
    useMatchSessionStore.getState().setPlaybackMinute(scene.minute);
    useMatchSessionStore.getState().markSceneReady();
    expect(useMatchSessionStore.getState().beginActionCommand(command)).toBe(
      true,
    );

    useMatchSessionStore.getState().resetMatchSession();
    expect(
      useMatchSessionStore.getState().setActionResponse(response, command),
    ).toBe(false);
    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "idle",
      match: null,
      pendingCommand: null,
      diagnostic: null,
    });
  });

  it("preserves structured contract diagnostics for recoverable UI handling", () => {
    useMatchSessionStore.getState().setError(
      new MatchApiContractError("Unsupported provider payload.", {
        apiVersion: "2",
        requestId: "request-contract",
        retryAfterSeconds: null,
      }),
    );

    expect(useMatchSessionStore.getState()).toMatchObject({
      phase: "recoverable_error",
      route: "main",
      diagnostic: {
        kind: "contract",
        message: "Unsupported provider payload.",
        retryable: true,
        metadata: {
          apiVersion: "2",
          requestId: "request-contract",
        },
      },
    });
  });
});
