import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BackendTeam,
  createBackendMatch,
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

describe("backend match client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("serializes canonical create, command, and decision requests", async () => {
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
    await createBackendMatch(
      createBody as Parameters<typeof createBackendMatch>[0],
    );
    await startBackendMatch(commandRequest.match_id);
    await processBackendMatchAction(
      decisionRequest.match_id,
      decisionRequest.match_decision,
    );

    expect(fetchMock.mock.calls[0][0]).toBe("/api/createMatch");
    expect(requestBody(fetchMock.mock.calls[0])).toEqual(createBody);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/startMatch");
    expect(requestBody(fetchMock.mock.calls[1])).toEqual(commandRequest);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/processMatchAction");
    expect(requestBody(fetchMock.mock.calls[2])).toEqual({
      match_id: decisionRequest.match_id,
      match_decision: decisionRequest.match_decision,
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
      processBackendMatchAction("match-fixture-1", { choice: "KICK" }),
    ).resolves.toEqual(fulltime);
    expect(defaultLegendProfile()).toMatchObject({ stamina: 78, energy: 78 });
  });

  it("surfaces the canonical error envelope", async () => {
    const error = await readFixture<{ error: string }>(
      "server/error-response.json",
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(error, 400));

    await expect(startBackendMatch("match-fixture-1")).rejects.toThrow(
      error.error,
    );
  });
});
