import { expect, type Page, type Response, test } from "@playwright/test";

import {
  createRealSmokeUnknownSceneCommand,
  publishRealSmokeFixtureCommand,
  waitForRealSmokeFixtureAcknowledgement,
} from "../scripts/real-server-smoke-support.mjs";

interface SessionPayload {
  legend: { legend_id: string };
  response_context: { cookie_csrf_token: null };
  session_credential: string;
}

interface CreatedMatchPayload {
  id: string;
  match: {
    id: string;
    match_status: "NOT_STARTED";
    revision: number;
  };
}

interface StartedMatchPayload {
  events: Array<{ event_id: number; minute: number }>;
  match: { id: string; current_time: number; revision: number };
  status: string;
}

interface BrowserApiResponse {
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: number;
}

interface ApiRequestRecord {
  headers: Record<string, string>;
  method: string;
  pathname: string;
}

interface CdpRequestEvent {
  requestId: string;
  request: {
    headers: Record<string, string | number>;
    method: string;
    url: string;
  };
}

interface CdpResponseEvent {
  requestId: string;
  response: {
    headers: Record<string, string | number>;
    status: number;
    url: string;
  };
}

const realSmoke = process.env.OVERGOAL_REAL_SERVER_SMOKE === "1";
const matchApiBaseUrl = process.env.OVERGOAL_MATCH_API_BASE_URL;
const matchApiOrigin = matchApiBaseUrl
  ? new URL(matchApiBaseUrl).origin
  : "https://real-api-not-configured.invalid";
const matchApiOperationPattern =
  /^\/(?:auth\/v1\/(?:challenges|sessions|session)|teams|createMatch|startMatch|match\/)/u;
const fixtureStateDirectory = process.env.OVERGOAL_REAL_SMOKE_STATE_DIRECTORY;

function header(
  headers: Record<string, string | number>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry ? String(entry[1]) : undefined;
}

async function browserApiRequest(
  page: Page,
  path: string,
  {
    body,
    headers = {},
    method = "GET",
  }: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
  } = {},
): Promise<BrowserApiResponse> {
  return page.evaluate(
    async ({ body, headers, method, url }) => {
      const response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        credentials: "omit",
        headers: body
          ? { "Content-Type": "application/json", ...headers }
          : headers,
        method,
      });
      const text = await response.text();
      return {
        body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
        headers: Object.fromEntries(response.headers.entries()),
        status: response.status,
      };
    },
    { body, headers, method, url: `${matchApiOrigin}${path}` },
  );
}

test("creates and starts through the actual separate-origin Match API", async ({
  page,
}) => {
  test.skip(!realSmoke, "Real Match API proof runs via its dedicated command.");
  test.setTimeout(180_000);

  expect(matchApiBaseUrl).toBe("https://127.0.0.1:3444");
  const clientOrigin = new URL(test.info().project.use.baseURL as string)
    .origin;
  expect(clientOrigin).toBe("https://127.0.0.1:4176");
  expect(matchApiOrigin).not.toBe(clientOrigin);

  const apiRequestRecords: Array<Promise<ApiRequestRecord>> = [];
  const apiResponses: Response[] = [];
  const preflightRequests = new Map<
    string,
    { headers: Record<string, string | number>; pathname: string }
  >();
  const preflightResponses: Array<{
    headers: Record<string, string | number>;
    pathname: string;
    status: number;
  }> = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== matchApiOrigin) return;
    apiRequestRecords.push(
      request.allHeaders().then((headers) => ({
        headers,
        method: request.method(),
        pathname: url.pathname,
      })),
    );
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== matchApiOrigin) return;
    apiResponses.push(response);
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.requestWillBeSent", (event: CdpRequestEvent) => {
    const url = new URL(event.request.url);
    if (url.origin !== matchApiOrigin || event.request.method !== "OPTIONS") {
      return;
    }
    preflightRequests.set(event.requestId, {
      headers: event.request.headers,
      pathname: url.pathname,
    });
  });
  cdp.on("Network.responseReceived", (event: CdpResponseEvent) => {
    const request = preflightRequests.get(event.requestId);
    if (!request) return;
    preflightResponses.push({
      headers: event.response.headers,
      pathname: request.pathname,
      status: event.response.status,
    });
  });

  await page.goto("/login");
  const sessionResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/auth/v1/sessions",
  );
  await page.getByRole("button", { name: "Connect Controller" }).click();
  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.status()).toBe(201);
  const sessionPayload = (await sessionResponse.json()) as SessionPayload;
  expect(sessionPayload).toMatchObject({
    legend: { legend_id: "local_demo_legend" },
    response_context: { cookie_csrf_token: null },
  });
  expect(sessionPayload.session_credential).toMatch(/^0x[0-9a-f]{64}$/u);
  expect(sessionResponse.headers()["set-cookie"]).toBeUndefined();

  await expect(page).toHaveURL(/\/post-login-screen$/u);
  await page.getByRole("button", { name: "Continue" }).click();

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/createMatch",
  );
  await page.getByRole("button", { name: "Play" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as CreatedMatchPayload;
  expect(created.id).toBe(created.match.id);
  expect(created.match.match_status).toBe("NOT_STARTED");
  expect(created.match.revision).toBe(0);
  await expect(page).toHaveURL(new RegExp(`/pre-match/${created.id}$`, "u"));

  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/startMatch",
  );
  await page.getByRole("button", { name: "Play" }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(200);
  const started = (await startResponse.json()) as StartedMatchPayload;
  expect(started.match.id).toBe(created.id);
  expect(started.match.revision).toBe(1);
  expect(started.match.current_time).toBeGreaterThan(0);
  expect(started.events.length).toBeGreaterThan(0);
  expect(started.events[0].event_id).toBe(1);

  await expect(page).toHaveURL(new RegExp(`/match/${created.id}$`, "u"), {
    timeout: 60_000,
  });
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();

  const apiRequests = await Promise.all(apiRequestRecords);
  const protectedRequests = apiRequests.filter(({ pathname }) =>
    /^\/(?:teams|createMatch|startMatch)$/u.test(pathname),
  );
  expect(protectedRequests.length).toBeGreaterThanOrEqual(3);
  for (const request of protectedRequests) {
    expect(request.headers.authorization).toBe(
      `Bearer ${sessionPayload.session_credential}`,
    );
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.origin).toBe(clientOrigin);
  }
  expect(
    protectedRequests.find(({ pathname }) => pathname === "/createMatch")
      ?.headers["idempotency-key"],
  ).toBeTruthy();
  expect(
    protectedRequests.find(({ pathname }) => pathname === "/startMatch")
      ?.headers["if-match-revision"],
  ).toBe("0");

  await expect.poll(() => preflightResponses.length).toBeGreaterThan(0);
  const protectedPreflights = preflightResponses.filter(({ pathname }) =>
    /^\/(?:teams|createMatch|startMatch)$/u.test(pathname),
  );
  expect(protectedPreflights.length).toBeGreaterThan(0);
  for (const response of protectedPreflights) {
    expect(response.status).toBe(204);
    expect(header(response.headers, "access-control-allow-origin")).toBe(
      clientOrigin,
    );
    expect(
      header(response.headers, "access-control-allow-credentials"),
    ).toBeUndefined();
  }
  expect(
    protectedPreflights.some(({ headers }) =>
      header(headers, "access-control-allow-headers")
        ?.toLowerCase()
        .includes("authorization"),
    ),
  ).toBe(true);

  for (const response of apiResponses) {
    expect(response.headers()["access-control-allow-origin"]).toBe(
      clientOrigin,
    );
    expect(
      response.headers()["access-control-allow-credentials"],
    ).toBeUndefined();
  }
  expect(startResponse.headers()["match-api-version"]).toBe("1");
  expect(startResponse.headers()["x-request-id"]).toBeTruthy();

  expect(
    apiRequests.every(({ pathname }) =>
      matchApiOperationPattern.test(pathname),
    ),
  ).toBe(true);
  const sameOriginApiRequests = await page.evaluate((origin) => {
    return performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => {
        const parsed = new URL(url);
        return (
          parsed.origin === origin &&
          /^\/(?:auth\/v1\/|teams$|createMatch$|startMatch$|match\/)/u.test(
            parsed.pathname,
          )
        );
      });
  }, clientOrigin);
  expect(sameOriginApiRequests).toEqual([]);
});

test("recovers an injected persisted unknown scene through the real HTTPS API", async ({
  page,
}) => {
  test.skip(!realSmoke, "Real Match API proof runs via its dedicated command.");
  test.setTimeout(180_000);

  if (!fixtureStateDirectory) {
    throw new Error(
      "Real-server smoke did not provide its fixture state directory.",
    );
  }

  const recoveryRequests: Array<Promise<ApiRequestRecord>> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== matchApiOrigin ||
      url.pathname !== "/processMatchAction"
    ) {
      return;
    }
    recoveryRequests.push(
      request.allHeaders().then((headers) => ({
        headers,
        method: request.method(),
        pathname: url.pathname,
      })),
    );
  });

  await page.goto("/login");
  const sessionResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/auth/v1/sessions",
  );
  await page.getByRole("button", { name: "Connect Controller" }).click();
  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.status()).toBe(201);
  const sessionPayload = (await sessionResponse.json()) as SessionPayload;

  await page.getByRole("button", { name: "Continue" }).click();
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/createMatch",
  );
  await page.getByRole("button", { name: "Play" }).click();
  const created = (await (
    await createResponsePromise
  ).json()) as CreatedMatchPayload;

  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/startMatch",
  );
  await page.getByRole("button", { name: "Play" }).click();
  const started = (await (
    await startResponsePromise
  ).json()) as StartedMatchPayload;
  expect(started.match.id).toBe(created.id);
  expect(started.match.revision).toBeGreaterThan(0);

  const sourceSnapshot = await browserApiRequest(page, `/match/${created.id}`, {
    headers: { Authorization: `Bearer ${sessionPayload.session_credential}` },
  });
  expect(sourceSnapshot.status).toBe(200);
  const sourceMatch = sourceSnapshot.body?.match as
    | { pending_action?: { id?: string } | null; revision?: number }
    | undefined;
  expect(sourceMatch?.pending_action?.id).toBeTruthy();
  expect(sourceMatch?.revision).toBe(started.match.revision);
  const sourceRevision = sourceMatch?.revision;
  if (
    typeof sourceRevision !== "number" ||
    !Number.isSafeInteger(sourceRevision)
  ) {
    throw new Error("Real Match API snapshot omitted its revision.");
  }

  const command = createRealSmokeUnknownSceneCommand({
    expectedRevision: sourceRevision,
    matchId: created.id,
  });
  await publishRealSmokeFixtureCommand(fixtureStateDirectory, command);
  const injected = await waitForRealSmokeFixtureAcknowledgement(
    fixtureStateDirectory,
    command.command_id,
  );
  expect(injected.matchId).toBe(created.id);
  expect(injected.revision).toBe(started.match.revision);

  const recoveryBody = {
    action_id: injected.actionId,
    match_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
    match_id: created.id,
  };
  const unauthenticated = await browserApiRequest(page, "/processMatchAction", {
    body: recoveryBody,
    headers: {
      "Idempotency-Key": "real-smoke-unauthenticated-recovery-0001",
      "If-Match-Revision": String(injected.revision),
    },
    method: "POST",
  });
  expect(unauthenticated.status).toBe(401);

  const hydratedUnknown = await browserApiRequest(
    page,
    `/match/${created.id}`,
    {
      headers: { Authorization: `Bearer ${sessionPayload.session_credential}` },
    },
  );
  expect(hydratedUnknown.status).toBe(200);
  expect(hydratedUnknown.body).toMatchObject({
    field_state: null,
    match: { revision: injected.revision },
    pending_action: null,
    unsupported_scene: {
      action_id: injected.actionId,
      recovery: { choice: "CONTINUE_WITHOUT_EVENT" },
      scene_type: "FUTURE_RANDOM_EVENT_V99",
    },
  });

  const idempotencyKey = "real-smoke-unknown-recovery-0001";
  const authenticatedHeaders = {
    Authorization: `Bearer ${sessionPayload.session_credential}`,
    "Idempotency-Key": idempotencyKey,
    "If-Match-Revision": String(injected.revision),
  };
  const recovered = await browserApiRequest(page, "/processMatchAction", {
    body: recoveryBody,
    headers: authenticatedHeaders,
    method: "POST",
  });
  expect(recovered.status).toBe(200);
  expect(recovered.headers["match-api-version"]).toBe("1");
  expect(recovered.body).toMatchObject({
    pending_settlement_events: [],
    unsupported_scene: null,
    unsupported_scene_recovery: {
      action_id: injected.actionId,
      outcome: "SKIPPED_NO_EFFECT",
      scene_type: "FUTURE_RANDOM_EVENT_V99",
    },
  });
  expect(recovered.body?.decision_result).toBeUndefined();

  const firstRecoveryRequests = await Promise.all(recoveryRequests);
  const authenticatedRecoveryRequests = firstRecoveryRequests.filter(
    (request) =>
      request.headers.authorization === authenticatedHeaders.Authorization,
  );
  expect(authenticatedRecoveryRequests).toHaveLength(1);
  expect(authenticatedRecoveryRequests[0]).toMatchObject({
    headers: expect.objectContaining({
      "idempotency-key": idempotencyKey,
      "if-match-revision": String(injected.revision),
      origin: "https://127.0.0.1:4176",
    }),
    method: "POST",
    pathname: "/processMatchAction",
  });

  const retry = await browserApiRequest(page, "/processMatchAction", {
    body: recoveryBody,
    headers: authenticatedHeaders,
    method: "POST",
  });
  expect(retry.status).toBe(200);
  expect(retry.body).toEqual(recovered.body);

  await page.evaluate((pathname) => {
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/match/${created.id}`);
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/match/${created.id}$`, "u"));

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/post-login-screen$/u, { timeout: 30_000 });
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/$/u);

  const reloadSnapshotPromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.origin === matchApiOrigin &&
        url.pathname === `/match/${created.id}`
      );
    },
  );
  await page.evaluate((pathname) => {
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/match/${created.id}`);
  const reloadSnapshot = await reloadSnapshotPromise;
  expect(reloadSnapshot.status()).toBe(200);
  const reloaded = (await reloadSnapshot.json()) as Record<string, unknown>;
  expect(reloaded).toMatchObject({
    pending_settlement_events: [],
    unsupported_scene: null,
  });
  expect(reloaded.decision_result).toBeUndefined();
  const timeline = reloaded.timeline as
    | Array<{ meta?: { outcome_type?: string } | null }>
    | undefined;
  expect(
    timeline?.filter(
      (event) => event.meta?.outcome_type === "UNSUPPORTED_SCENE_SKIPPED",
    ),
  ).toHaveLength(1);
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
  await expect(page.getByTestId("unsupported-event-recovery")).toHaveCount(0);
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
});
