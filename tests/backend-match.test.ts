import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthSessionStore } from "../src/auth/session-store";
import {
  type BackendMatch,
  type BackendMatchResponse,
  type BackendTeam,
  createBackendMatch,
  createMatchCommand,
  defaultLegendProfile,
  fetchBackendMatch,
  fetchBackendTeams,
  MatchApiContractError,
  processBackendMatchAction,
  startBackendMatch,
} from "../src/lib/backend-match";
import { readFixture } from "./match-api-v1-fixtures";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Match-API-Version": "1",
      "X-Request-Id": "request-fixture",
      ...headers,
    },
  });
}

function requestBody(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

function requestHeader(call: unknown[], name: string) {
  return new Headers((call[1] as RequestInit).headers).get(name);
}

const currentMatch: BackendMatch = {
  id: "match-fixture-1",
  my_team_id: "team_1",
  opponent_team_id: "team_2",
  my_team_score: 0,
  opponent_team_score: 0,
  current_time: 12,
  prev_time: 11,
  revision: 7,
  match_status: "WAITING_FOR_DECISION",
  pending_action: null,
};

describe("backend match client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x1",
      chainId: "0x534e5f5345504f4c4941",
      session: {},
      transport: "cookie",
      csrfToken: "csrf-fixture",
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    useAuthSessionStore.getState().clear();
    vi.unstubAllGlobals();
  });

  it("serializes canonical commands with CSRF, revision, action, and stable idempotency metadata", async () => {
    const createRequest = await readFixture<Record<string, unknown>>(
      "player-client/create-match-request.json",
    );
    const commandRequest = await readFixture<Record<string, string>>(
      "player-client/match-command-request.json",
    );
    const decisionRequest = await readFixture<{
      action_id: string;
      match_id: string;
      match_decision: Record<string, unknown>;
    }>("player-client/kick-decision-request.json");
    const createResponse = await readFixture(
      "server/create-match-response.json",
    );
    const waitingResponse = await readFixture(
      "server/waiting-open-play-response.json",
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse(createResponse, 201))
      .mockResolvedValueOnce(jsonResponse(waitingResponse))
      .mockResolvedValueOnce(jsonResponse(waitingResponse));

    const createBody = { ...createRequest };
    delete createBody.seed;
    const createCommand = createMatchCommand("create", createBody, {
      idempotencyKey: "create-key",
    });
    const startCommand = createMatchCommand("start", commandRequest, {
      matchId: currentMatch.id,
      revision: currentMatch.revision,
      idempotencyKey: "start-key",
    });
    const actionCommand = createMatchCommand("action", decisionRequest, {
      matchId: currentMatch.id,
      revision: currentMatch.revision,
      actionId: decisionRequest.action_id,
      idempotencyKey: "action-key",
    });

    await createBackendMatch(
      createBody as Parameters<typeof createBackendMatch>[0],
      createCommand,
    );
    await startBackendMatch(currentMatch, startCommand);
    await processBackendMatchAction(
      currentMatch,
      decisionRequest.action_id,
      decisionRequest.match_decision,
      actionCommand,
    );

    expect(fetchMock.mock.calls[0][0]).toBe("/api/createMatch");
    expect(requestBody(fetchMock.mock.calls[0])).toEqual(createBody);
    expect(requestHeader(fetchMock.mock.calls[0], "Idempotency-Key")).toBe(
      "create-key",
    );
    expect(requestHeader(fetchMock.mock.calls[0], "X-CSRF-Token")).toBe(
      "csrf-fixture",
    );
    expect(fetchMock.mock.calls[1][0]).toBe("/api/startMatch");
    expect(requestBody(fetchMock.mock.calls[1])).toEqual(commandRequest);
    expect(requestHeader(fetchMock.mock.calls[1], "If-Match-Revision")).toBe(
      "7",
    );
    expect(requestHeader(fetchMock.mock.calls[1], "Idempotency-Key")).toBe(
      "start-key",
    );
    expect(fetchMock.mock.calls[2][0]).toBe("/api/processMatchAction");
    expect(requestBody(fetchMock.mock.calls[2])).toEqual(decisionRequest);
    expect(requestHeader(fetchMock.mock.calls[2], "If-Match-Revision")).toBe(
      "7",
    );
    expect(requestHeader(fetchMock.mock.calls[2], "Idempotency-Key")).toBe(
      "action-key",
    );
  });

  it("reuses an ambiguous command's idempotency key and original payload", async () => {
    const command = createMatchCommand(
      "action",
      {
        match_id: currentMatch.id,
        action_id: "action-open-1",
        match_decision: { choice: "KICK", power: 42 },
      },
      {
        matchId: currentMatch.id,
        revision: currentMatch.revision,
        actionId: "action-open-1",
        idempotencyKey: "retry-key",
      },
    );
    const response = await readFixture(
      "server/waiting-open-play-response.json",
    );
    fetchMock
      .mockRejectedValueOnce(new TypeError("network disconnected"))
      .mockResolvedValueOnce(jsonResponse(response));

    await expect(
      processBackendMatchAction(
        currentMatch,
        "action-open-1",
        { choice: "KICK", power: 99 },
        command,
      ),
    ).rejects.toThrow("network disconnected");
    await processBackendMatchAction(
      currentMatch,
      "action-open-1",
      { choice: "KICK", power: 100 },
      command,
    );

    expect(requestHeader(fetchMock.mock.calls[0], "Idempotency-Key")).toBe(
      "retry-key",
    );
    expect(requestHeader(fetchMock.mock.calls[1], "Idempotency-Key")).toBe(
      "retry-key",
    );
    expect(requestBody(fetchMock.mock.calls[0])).toEqual(
      requestBody(fetchMock.mock.calls[1]),
    );
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      match_decision: { power: 42 },
    });
  });

  it("parses canonical server bodies for every public read and command helper", async () => {
    const snapshot = await readFixture("server/match-snapshot-response.json");
    const fulltime = await readFixture("server/fulltime-response.json");
    const create = await readFixture<{
      my_team: BackendTeam;
      opponent_team: BackendTeam;
    }>("server/create-match-response.json");

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ teams: [create.my_team, create.opponent_team] }),
      )
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(jsonResponse(fulltime));

    await expect(fetchBackendTeams()).resolves.toEqual([
      create.my_team,
      create.opponent_team,
    ]);
    await expect(fetchBackendMatch("match-fixture-1")).resolves.toEqual(
      snapshot,
    );
    await expect(
      processBackendMatchAction(currentMatch, "action-open-1", {
        choice: "KICK",
      }),
    ).resolves.toEqual(fulltime);
    expect(defaultLegendProfile()).toMatchObject({ stamina: 78, energy: 78 });
  });

  it("surfaces the canonical error envelope", async () => {
    const error = await readFixture<{ error: string }>(
      "server/error-response.json",
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(error, 400));

    await expect(startBackendMatch(currentMatch)).rejects.toThrow(error.error);
  });

  it("rejects malformed or version-mismatched provider responses before they reach UI state", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ teams: "not-an-array" }, 200))
      .mockResolvedValueOnce(
        jsonResponse({ teams: [] }, 200, { "Match-API-Version": "2" }),
      );

    await expect(fetchBackendTeams()).rejects.toBeInstanceOf(
      MatchApiContractError,
    );
    await expect(fetchBackendTeams()).rejects.toMatchObject({
      metadata: { apiVersion: "2", requestId: "request-fixture" },
    });
  });

  it("rejects pre-match responses without a complete authoritative Legend", async () => {
    const create = await readFixture<Record<string, unknown>>(
      "server/create-match-response.json",
    );
    const snapshot = await readFixture<Record<string, unknown>>(
      "server/match-snapshot-response.json",
    );
    const missingLegendId = structuredClone(create) as {
      match: Record<string, unknown>;
    };
    delete missingLegendId.match.legend_player_id;
    const malformedLegend = structuredClone(create) as {
      match: { legend_profile: Record<string, unknown> };
    };
    malformedLegend.match.legend_profile.stamina = "not-a-rating";
    const preMatchSnapshot = structuredClone(snapshot) as {
      match: Record<string, unknown>;
    };
    preMatchSnapshot.match.match_status = "NOT_STARTED";

    fetchMock
      .mockResolvedValueOnce(jsonResponse(missingLegendId, 201))
      .mockResolvedValueOnce(jsonResponse(malformedLegend, 201))
      .mockResolvedValueOnce(jsonResponse(preMatchSnapshot));

    await expect(
      createBackendMatch({
        my_team_id: "team_1",
        opponent_team_id: "team_2",
        player_profile: defaultLegendProfile(),
      }),
    ).rejects.toBeInstanceOf(MatchApiContractError);
    await expect(
      createBackendMatch({
        my_team_id: "team_1",
        opponent_team_id: "team_2",
        player_profile: defaultLegendProfile(),
      }),
    ).rejects.toBeInstanceOf(MatchApiContractError);
    await expect(fetchBackendMatch("match-fixture-1")).rejects.toBeInstanceOf(
      MatchApiContractError,
    );
  });

  it("rejects a response whose pending action and field state disagree", async () => {
    const response = await readFixture<BackendMatchResponse>(
      "server/waiting-open-play-response.json",
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...response,
        field_state: { ...response.field_state, match_id: "another-match" },
      }),
    );

    await expect(startBackendMatch(currentMatch)).rejects.toBeInstanceOf(
      MatchApiContractError,
    );
  });

  it("rejects incomplete match revisions and unsupported scene contract versions", async () => {
    const waiting = await readFixture<BackendMatchResponse>(
      "server/waiting-open-play-response.json",
    );
    const missingRevision = structuredClone(waiting) as unknown as {
      match: Record<string, unknown>;
    };
    delete missingRevision.match.revision;
    const futureContract = structuredClone(waiting);
    if (
      !futureContract.pending_action ||
      !futureContract.match.pending_action
    ) {
      throw new Error("Waiting fixture must include its pending action.");
    }
    futureContract.pending_action.contract_version = 3;
    futureContract.match.pending_action.contract_version = 3;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(missingRevision))
      .mockResolvedValueOnce(jsonResponse(futureContract));

    await expect(
      processBackendMatchAction(currentMatch, "action-open-1", {
        choice: "KICK",
      }),
    ).rejects.toBeInstanceOf(MatchApiContractError);
    await expect(
      processBackendMatchAction(currentMatch, "action-open-1", {
        choice: "KICK",
      }),
    ).rejects.toBeInstanceOf(MatchApiContractError);
  });

  it("preserves structured retry metadata and uses bearer transport without cookie CSRF", async () => {
    const rateLimited = await readFixture("server/rate-limited-response.json");
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x2",
      chainId: "0x534e5f5345504f4c4941",
      session: {},
      transport: "bearer",
      bearerCredential: "opaque-bearer",
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(rateLimited, 429, { "Retry-After": "3" }),
    );

    await expect(fetchBackendMatch("match-fixture-1")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      retryable: true,
      metadata: { retryAfterSeconds: 3 },
    });
    expect(requestHeader(fetchMock.mock.calls[0], "Authorization")).toBe(
      "Bearer opaque-bearer",
    );
    expect(requestHeader(fetchMock.mock.calls[0], "X-CSRF-Token")).toBeNull();
  });
});
