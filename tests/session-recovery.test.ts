import { describe, expect, it } from "vitest";

import { createMatchCommand } from "../src/match/api-v1/adapter";
import type {
  BackendMatch,
  BackendPendingAction,
  BackendTeam,
  BackendUnsupportedSceneRecovery,
} from "../src/match/api-v1/contract";
import {
  createInitialMatchSession,
  matchSessionReducer,
} from "../src/match/session-machine";
import {
  commandCanRetryAfterHydration,
  fieldDraftMatchesSnapshot,
  type MatchFieldDraft,
  parseMatchRecoveryJournal,
} from "../src/match/session-recovery";
import { readFixture } from "./match-api-v1-fixtures";

async function fixture() {
  const [action, teams] = await Promise.all([
    readFixture<BackendPendingAction>("scenes/open-play.json"),
    readFixture<{ my_team: BackendTeam; opponent_team: BackendTeam }>(
      "server/create-match-response.json",
    ),
  ]);
  const match: BackendMatch = {
    id: "match-fixture-1",
    my_team_id: teams.my_team.id,
    opponent_team_id: teams.opponent_team.id,
    my_team_score: 0,
    opponent_team_score: 0,
    current_time: action.minute,
    prev_time: action.minute - 1,
    revision: 7,
    match_status: "WAITING_FOR_DECISION",
    pending_action: action,
  };
  return { action, match, teams };
}

function draftFor(action: BackendPendingAction, revision = 7): MatchFieldDraft {
  return {
    kind: "kick",
    matchId: "match-fixture-1",
    revision,
    actionId: action.id,
    aim: {
      dragStart: { x: 0, y: 1, z: 0 },
      dragCurrent: { x: -4, y: 1, z: 7 },
      shotVector: { x: 4, y: 0, z: -7 },
      normalizedDirection: { x: 0.5, y: 0, z: -0.86 },
      pullDistance: 8,
      normalizedPower: 0.65,
    },
    contact: { x: 0.45, y: -0.15 },
  };
}

describe("M2-I7 session recovery", () => {
  it("discards malformed journal commands and drafts before hydration", async () => {
    const { action } = await fixture();
    const validCommand = createMatchCommand(
      "action",
      {
        match_id: "match-fixture-1",
        action_id: action.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: "match-fixture-1",
        revision: 7,
        actionId: action.id,
        idempotencyKey: "journal-command",
      },
    );
    const partialDraft = draftFor(action);
    delete (partialDraft.aim as Partial<MatchFieldDraft["aim"]>).shotVector;

    const journal = parseMatchRecoveryJournal(
      JSON.stringify({
        version: 1,
        pendingCommand: {
          ...validCommand,
          revision: -1,
        },
        fieldDraft: partialDraft,
      }),
    );

    expect(journal).toEqual({
      version: 1,
      pendingCommand: null,
      fieldDraft: null,
    });
  });

  it("discards non-finite and out-of-range persisted aim values", async () => {
    const { action } = await fixture();
    const corruptDraft = {
      ...draftFor(action),
      aim: {
        ...draftFor(action).aim,
        normalizedPower: Number.POSITIVE_INFINITY,
        normalizedDirection: { x: 0, y: 0, z: 4 },
      },
      contact: { x: 1.2, y: 0 },
    };

    const journal = parseMatchRecoveryJournal(
      JSON.stringify({
        version: 1,
        pendingCommand: null,
        fieldDraft: corruptDraft,
      }),
    );

    expect(journal.fieldDraft).toBeNull();
    expect(
      parseMatchRecoveryJournal(
        '{"version":1,"pendingCommand":null,"fieldDraft":{"kind":"kick","matchId":"match-fixture-1","revision":7,"actionId":"a","aim":{"dragStart":{"x":1e999,"y":0,"z":0}}}}',
      ).fieldDraft,
    ).toBeNull();
  });

  it("retains only a draft that proves match, revision, and action identity", async () => {
    const { action, match } = await fixture();
    const draft = draftFor(action);
    const snapshot = { match, pendingAction: action };

    expect(fieldDraftMatchesSnapshot(draft, snapshot)).toBe(true);
    expect(
      fieldDraftMatchesSnapshot(
        { ...draft, revision: draft.revision + 1 },
        snapshot,
      ),
    ).toBe(false);
    expect(
      fieldDraftMatchesSnapshot(
        { ...draft, actionId: "another-action" },
        snapshot,
      ),
    ).toBe(false);
  });

  it("allows an ambiguous command retry only at the exact hydrated revision", async () => {
    const { action, match } = await fixture();
    const command = createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: action.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: action.id,
        idempotencyKey: "reconnect-exact-key",
      },
    );

    expect(commandCanRetryAfterHydration(command, { match })).toBe(true);
    expect(
      commandCanRetryAfterHydration(command, {
        match: { ...match, revision: match.revision + 1 },
      }),
    ).toBe(false);
  });

  it("restores a committed decision from the matching operation receipt", async () => {
    const { action, match, teams } = await fixture();
    const command = createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: action.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: action.id,
        idempotencyKey: "receipt-key",
      },
    );
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
      },
    });
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: action.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });

    const committedMatch = {
      ...match,
      revision: match.revision + 1,
      match_status: "IN_PROGRESS",
      pending_action: null,
    };
    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: committedMatch,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
        latestOperation: {
          version: 1,
          operation_id: "operation-receipt-1",
          operation: "processMatchAction",
          status: "COMMITTED",
          request_revision: match.revision,
          committed_revision: committedMatch.revision,
          action_id: action.id,
          playback: {
            version: 1,
            submitted_action: action,
            submitted_field_state: action.field_state ?? null,
            last_decision: { choice: "KICK" },
            decision_result: {
              description: "Successful pass.",
              success: true,
              outcome_type: "PASS_COMPLETED",
            },
            events: [],
          },
        },
      },
    });

    expect(state).toMatchObject({
      phase: "result_playback",
      pendingCommand: null,
      retrySafe: false,
      fieldDraft: null,
      decisionResult: { outcome_type: "PASS_COMPLETED" },
      resultPlayback: { operation_id: "operation-receipt-1" },
    });
  });

  it("enables an exact retry only after hydration proves the action did not commit", async () => {
    const { action, match, teams } = await fixture();
    const command = createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: action.id,
        match_decision: { choice: "KICK" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: action.id,
        idempotencyKey: "retry-after-receipt-check",
      },
    );
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
      },
    });
    state = matchSessionReducer(state, {
      type: "TIMELINE_TICK",
      minute: action.minute,
    });
    state = matchSessionReducer(state, { type: "SCENE_READY" });
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "ERROR_RECORDED",
      diagnostic: {
        kind: "network",
        message: "The connection closed before a response arrived.",
        retryable: true,
        recoveryAction: "CHECK_TRANSPORT",
      },
    });
    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match,
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
        pendingAction: action,
        latestOperation: null,
      },
    });

    expect(state).toMatchObject({
      phase: "recoverable_error",
      recoveryPhase: "scene_ready",
      retrySafe: true,
      pendingCommand: { idempotencyKey: "retry-after-receipt-check" },
      diagnostic: { recoveryAction: "RETRY_SAME_REQUEST" },
    });
  });

  it("continues from a committed no-effect recovery receipt without field playback", async () => {
    const { action, match, teams } = await fixture();
    const recovery: BackendUnsupportedSceneRecovery = {
      version: 1,
      status: "RECOVERY_REQUIRED",
      code: "UNSUPPORTED_SCENE_TYPE",
      scene_type: "FUTURE_SCENE",
      contract_version: 2,
      supported_contract_version: 1,
      action_id: action.id,
      action_sequence: 1,
      minute: action.minute,
      recovery: {
        choice: "CONTINUE_WITHOUT_EVENT",
        label: "Continue",
        description: "Continue without this event.",
        input_schema: {
          type: "object",
          required: ["choice"],
          allowed: ["choice"],
          additional_properties: false,
        },
      },
    };
    const command = createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: action.id,
        match_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId: action.id,
        idempotencyKey: "no-effect-receipt",
      },
    );
    let state = matchSessionReducer(createInitialMatchSession(), {
      type: "HYDRATED",
      payload: {
        match: {
          ...match,
          match_status: "WAITING_FOR_RECOVERY",
          pending_action: null,
        },
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
        pendingAction: null,
        unsupportedScene: recovery,
      },
    });
    state = matchSessionReducer(state, { type: "ACTION_REQUESTED", command });
    state = matchSessionReducer(state, {
      type: "HYDRATED",
      payload: {
        match: {
          ...match,
          revision: match.revision + 1,
          current_time: action.minute + 1,
          match_status: "IN_PROGRESS",
          pending_action: null,
        },
        myTeam: teams.my_team,
        opponentTeam: teams.opponent_team,
        timelineEvents: [],
        pendingAction: null,
        latestOperation: {
          version: 1,
          operation_id: "no-effect-operation",
          operation: "processMatchAction",
          status: "COMMITTED",
          request_revision: match.revision,
          committed_revision: match.revision + 1,
          action_id: action.id,
          playback: {
            version: 1,
            submitted_action: null,
            submitted_field_state: null,
            last_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
            decision_result: {
              description: "Unsupported event skipped.",
              success: true,
              outcome_type: "SKIPPED_NO_EFFECT",
              immediate_effects: {},
              pending_settlement_events: [],
              unsupported_scene_recovery: {
                version: 1,
                status: "RECOVERED",
                outcome: "SKIPPED_NO_EFFECT",
                scene_type: "FUTURE_SCENE",
                action_id: action.id,
                recovered_revision: match.revision + 1,
              },
            },
            events: [],
          },
        },
      },
    });

    expect(state).toMatchObject({
      phase: "timeline_playback",
      pendingCommand: null,
      decisionResult: null,
      resultPlayback: null,
    });
  });
});
