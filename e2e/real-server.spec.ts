import { expect, type Response, test } from "@playwright/test";

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

function header(
  headers: Record<string, string | number>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry ? String(entry[1]) : undefined;
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
