import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthSessionStore } from "../src/auth/session-store";
import {
  type BackendMatch,
  type BackendTeam,
  createBackendMatch,
  createMatchCommand,
  defaultLegendProfile,
  fetchBackendMatch,
  fetchBackendTeams,
  processBackendMatchAction,
  startBackendMatch,
} from "../src/lib/backend-match";
import { readFixture } from "./match-api-v1-fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
  revision: 7,
  match_status: "WAITING_FOR_DECISION",
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
        match_decision: { choice: "KICK", seed: 42 },
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
        { choice: "KICK", seed: 99 },
        command,
      ),
    ).rejects.toThrow("network disconnected");
    await processBackendMatchAction(
      currentMatch,
      "action-open-1",
      { choice: "KICK", seed: 100 },
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
      match_decision: { seed: 42 },
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
});
