import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticateWalletSession,
  hydrateAuthSession,
  logoutAuthSession,
} from "../src/auth/api";
import { useAuthSessionStore } from "../src/auth/session-store";
import { useMatchSessionStore } from "../src/match/session-store";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headers(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers);
}

const typedData = {
  types: {
    StarknetDomain: [],
    OvergoalAuthChallenge: [],
  },
  primaryType: "OvergoalAuthChallenge",
  domain: {
    name: "Overgoal Auth",
    version: "1",
    chainId: "0x534e",
    revision: "1",
  },
  message: {},
};

const challengeResponse = {
  challenge_id: "0x11111111111111111111111111111111",
  action: "CREATE_SESSION",
  account_address: "0x123",
  chain_id: "0x534e",
  expires_at: "2026-07-19T12:05:00.000Z",
  typed_data: typedData,
};

function sessionResponse(csrfToken: string | null) {
  return {
    session: {
      issued_at: "2026-07-19T12:00:00.000Z",
      idle_expires_at: "2026-07-19T12:15:00.000Z",
      absolute_expires_at: "2026-07-20T12:00:00.000Z",
      subject: {
        provider: "starknet",
        chain_id: "0x534e",
        account_address: "0x123",
      },
    },
    legend: { legend_id: "legend-1" },
    response_context: { cookie_csrf_token: csrfToken },
  };
}

describe("auth session client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useAuthSessionStore.getState().clear();
    useMatchSessionStore.getState().resetMatchSession();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends the approved top-level proof wire shape and accepts the cookie on session creation", async () => {
    const signMessage = vi.fn().mockResolvedValue(["0x11", "0x22"]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(challengeResponse, 201))
      .mockResolvedValueOnce(
        jsonResponse(sessionResponse("csrf-created"), 201),
      );

    await authenticateWalletSession({
      accountAddress: "0x123",
      chainId: "0x534e",
      signMessage,
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth/v1/challenges",
      "/api/auth/v1/sessions",
    ]);
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
    ).toEqual({
      action: "CREATE_SESSION",
      chain_id: "0x534e",
      account_address: "0x123",
    });
    expect(signMessage).toHaveBeenCalledWith(typedData);
    expect(
      JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string),
    ).toEqual({
      challenge_id: challengeResponse.challenge_id,
      account_address: "0x123",
      chain_id: "0x534e",
      signature: { r: "0x11", s: "0x22" },
    });
    expect(headers(fetchMock.mock.calls[0]).get("X-CSRF-Token")).toBeNull();
    expect(headers(fetchMock.mock.calls[1]).get("X-CSRF-Token")).toBeNull();
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe(
      "omit",
    );
    expect((fetchMock.mock.calls[1][1] as RequestInit).credentials).toBe(
      "same-origin",
    );
    expect(useAuthSessionStore.getState()).toMatchObject({
      status: "authenticated",
      transport: "cookie",
      csrfToken: "csrf-created",
      bearerCredential: null,
      walletAddress: "0x123",
    });
  });

  it("hydrates only the session-bound cookie CSRF token and keeps it in memory", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(sessionResponse("csrf-hydrated")),
    );
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);

    await hydrateAuthSession();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/v1/session");
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe(
      "same-origin",
    );
    expect(headers(fetchMock.mock.calls[0]).get("X-CSRF-Token")).toBeNull();
    expect(useAuthSessionStore.getState()).toMatchObject({
      status: "authenticated",
      csrfToken: "csrf-hydrated",
      bearerCredential: null,
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("never retains cookie CSRF material while hydrating bearer transport", async () => {
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x123",
      chainId: "0x534e",
      session: {},
      transport: "bearer",
      bearerCredential: "bearer-memory-only",
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(sessionResponse(null)));

    await hydrateAuthSession();

    expect(headers(fetchMock.mock.calls[0]).get("Authorization")).toBe(
      "Bearer bearer-memory-only",
    );
    expect(useAuthSessionStore.getState()).toMatchObject({
      transport: "bearer",
      csrfToken: null,
      bearerCredential: "bearer-memory-only",
    });
  });

  it("clears auth and match state after logout or an account switch", async () => {
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x123",
      chainId: "0x534e",
      session: {},
      transport: "cookie",
      csrfToken: "csrf-token",
    });
    useMatchSessionStore.getState().setCreatedMatch({
      match: {
        id: "match-owner-a",
        my_team_id: "team_1",
        opponent_team_id: "team_2",
        my_team_score: 0,
        opponent_team_score: 0,
        current_time: 0,
        revision: 1,
        match_status: "NOT_STARTED",
      },
      myTeam: { id: "team_1", name: "A", offense: 1, defense: 1, intensity: 1 },
      opponentTeam: {
        id: "team_2",
        name: "B",
        offense: 1,
        defense: 1,
        intensity: 1,
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await logoutAuthSession();
    useAuthSessionStore.getState().beginAccountSwitch();
    useMatchSessionStore.getState().resetMatchSession();

    expect(headers(fetchMock.mock.calls[0]).get("X-CSRF-Token")).toBeNull();
    expect(useAuthSessionStore.getState()).toMatchObject({
      status: "account_switching",
      csrfToken: null,
      bearerCredential: null,
    });
    expect(useMatchSessionStore.getState().match).toBeNull();
  });
});
