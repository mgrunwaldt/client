import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthApiClient,
  createAuthenticatedRequestInit,
} from "../src/auth/api";
import {
  joinMatchApiPath,
  requireMatchApiConfig,
  resolveMatchApiConfig,
} from "../src/auth/api-config";
import { useAuthSessionStore } from "../src/auth/session-store";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestHeaders(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers);
}

const typedData = {
  types: { StarknetDomain: [], OvergoalAuthChallenge: [] },
  primaryType: "OvergoalAuthChallenge",
  domain: {
    name: "Overgoal Auth",
    version: "1",
    chainId: "0x534e",
    revision: "1",
  },
  message: {},
};

const challenge = {
  challenge_id: "challenge-1",
  action: "CREATE_SESSION" as const,
  account_address: "0x123",
  chain_id: "0x534e",
  expires_at: "2026-07-19T12:05:00.000Z",
  typed_data: typedData,
};

function sessionResponse(credential: string | undefined = undefined) {
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
    response_context: { cookie_csrf_token: null },
    ...(credential ? { session_credential: credential } : {}),
  };
}

describe("Match API transport configuration", () => {
  it("normalizes same-origin paths and direct API paths exactly once", () => {
    const sameOrigin = requireMatchApiConfig(
      resolveMatchApiConfig("/api/", "https://play.overgoal.example"),
    );
    const direct = requireMatchApiConfig(
      resolveMatchApiConfig(
        "https://match.overgoal.example/api/",
        "https://play.overgoal.example",
      ),
    );

    expect(sameOrigin).toMatchObject({
      baseUrl: "/api",
      transport: "cookie",
    });
    expect(direct).toMatchObject({
      baseUrl: "https://match.overgoal.example/api",
      transport: "bearer",
    });
    expect(joinMatchApiPath(sameOrigin.baseUrl, "/teams")).toBe("/api/teams");
    expect(joinMatchApiPath(direct.baseUrl, "/teams")).toBe(
      "https://match.overgoal.example/api/teams",
    );
  });

  it("permits HTTP only for localhost development and reports safe config diagnostics", () => {
    expect(
      resolveMatchApiConfig("http://localhost:3100/", "https://localhost:3002"),
    ).toMatchObject({ valid: true, transport: "bearer" });
    expect(
      resolveMatchApiConfig(
        "http://match.overgoal.example",
        "https://play.overgoal.example",
      ),
    ).toMatchObject({ valid: false });
    expect(
      resolveMatchApiConfig(
        "https://user:secret@match.overgoal.example",
        "https://play.overgoal.example",
      ),
    ).toMatchObject({ valid: false });
    expect(
      resolveMatchApiConfig(
        "match.overgoal.example/api",
        "https://play.overgoal.example",
      ),
    ).toMatchObject({ valid: false });
  });
});

describe("direct Match API bearer transport", () => {
  const fetchMock = vi.fn();
  const directConfig = requireMatchApiConfig(
    resolveMatchApiConfig(
      "https://match.overgoal.example/api/",
      "https://play.overgoal.example",
    ),
  );

  beforeEach(() => {
    useAuthSessionStore.getState().clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("requests an in-memory bearer session without credentialed CORS", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(challenge, 201))
      .mockResolvedValueOnce(
        jsonResponse(sessionResponse("bearer-memory"), 201),
      );
    const api = createAuthApiClient(directConfig);

    await api.authenticateWalletSession({
      accountAddress: "0x123",
      chainId: "0x534e",
      signMessage: vi.fn().mockResolvedValue(["0x11", "0x22"]),
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://match.overgoal.example/api/auth/v1/challenges",
      "https://match.overgoal.example/api/auth/v1/sessions",
    ]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe(
      "omit",
    );
    expect((fetchMock.mock.calls[1][1] as RequestInit).credentials).toBe(
      "omit",
    );
    expect(
      requestHeaders(fetchMock.mock.calls[0]).get("Overgoal-Session-Transport"),
    ).toBeNull();
    expect(
      requestHeaders(fetchMock.mock.calls[1]).get("Overgoal-Session-Transport"),
    ).toBe("bearer");
    expect(
      requestHeaders(fetchMock.mock.calls[1]).get("Authorization"),
    ).toBeNull();
    expect(
      requestHeaders(fetchMock.mock.calls[1]).get("X-CSRF-Token"),
    ).toBeNull();
    expect(useAuthSessionStore.getState()).toMatchObject({
      transport: "bearer",
      bearerCredential: "bearer-memory",
      csrfToken: null,
    });
  });

  it("hydrates and logs out with the memory bearer and never cookie credentials", async () => {
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x123",
      chainId: "0x534e",
      session: {},
      transport: "bearer",
      bearerCredential: "bearer-memory",
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(sessionResponse()))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createAuthApiClient(directConfig);

    await api.hydrateAuthSession();
    await api.logoutAuthSession();

    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).credentials).toBe("omit");
      expect(requestHeaders(call).get("X-CSRF-Token")).toBeNull();
      expect(requestHeaders(call).get("Authorization")).toBe(
        "Bearer bearer-memory",
      );
    }
    expect(useAuthSessionStore.getState().status).toBe("unknown");
  });

  it("uses the same bearer-only request policy for unsafe Match API commands", () => {
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: "0x123",
      chainId: "0x534e",
      session: {},
      transport: "bearer",
      bearerCredential: "bearer-memory",
    });

    const request = createAuthenticatedRequestInit(
      directConfig,
      { method: "POST" },
      true,
    );

    expect(request.credentials).toBe("omit");
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer bearer-memory",
    );
    expect(new Headers(request.headers).get("X-CSRF-Token")).toBeNull();
  });
});
