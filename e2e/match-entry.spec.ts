import { expect, test } from "@playwright/test";
import { sepolia } from "@starknet-react/chains";

import waitingOpenPlayFixture from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };

interface LocalCiWallet {
  address: string;
}

const encodedWallets = process.env.OVERGOAL_LOCAL_CI_WALLETS;
if (!encodedWallets) {
  throw new Error("OVERGOAL_LOCAL_CI_WALLETS is required by match E2E.");
}

const [wallet] = JSON.parse(encodedWallets) as LocalCiWallet[];
const chainId = `0x${sepolia.id.toString(16)}`;
const csrfToken = "0x" + "d".repeat(64);
const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "request-match-entry-e2e",
};

function challengeResponse() {
  return {
    challenge_id: "0x" + "1".repeat(32),
    action: "CREATE_SESSION",
    account_address: wallet.address,
    chain_id: chainId,
    expires_at: "2026-07-19T12:05:00.000Z",
    typed_data: {
      types: {
        StarknetDomain: [
          { name: "name", type: "shortstring" },
          { name: "version", type: "shortstring" },
          { name: "chainId", type: "shortstring" },
          { name: "revision", type: "shortstring" },
        ],
        OvergoalAuthChallenge: [{ name: "challenge_hash", type: "felt" }],
      },
      primaryType: "OvergoalAuthChallenge",
      domain: {
        name: "Overgoal Auth",
        version: "1",
        chainId,
        revision: "1",
      },
      message: { challenge_hash: "0x1" },
    },
  };
}

function sessionResponse() {
  return {
    session: {
      issued_at: "2026-07-19T12:00:00.000Z",
      idle_expires_at: "2026-07-19T12:15:00.000Z",
      absolute_expires_at: "2026-07-20T12:00:00.000Z",
      subject: {
        provider: "starknet",
        chain_id: chainId,
        account_address: wallet.address,
      },
    },
    legend: { legend_id: "legend-match-entry" },
    response_context: { cookie_csrf_token: csrfToken },
  };
}

const teams = [
  {
    id: "team-1",
    name: "Dojo United",
    offense: 80,
    defense: 75,
    intensity: 70,
  },
  {
    id: "team-2",
    name: "Cartridge City",
    offense: 76,
    defense: 74,
    intensity: 72,
  },
];

function createMatchResponse() {
  return {
    id: "match-entry-e2e",
    match: {
      id: "match-entry-e2e",
      my_team_id: "team-1",
      opponent_team_id: "team-2",
      my_team_score: 0,
      opponent_team_score: 0,
      current_time: 0,
      prev_time: 0,
      revision: 1,
      match_status: "NOT_STARTED",
      pending_action: null,
      event_counter: 0,
      seed: "match-entry-e2e-seed",
      engine_version: "match-engine/1",
      ruleset_version: "nss-match-v2/1",
      initial_state: {},
    },
    my_team: teams[0],
    opponent_team: teams[1],
  };
}

function startedMatchResponse() {
  const serialized = JSON.stringify(waitingOpenPlayFixture).replaceAll(
    "match-fixture-1",
    "match-entry-e2e",
  );
  const response = JSON.parse(serialized) as typeof waitingOpenPlayFixture;
  response.match.revision = 2;
  return response;
}

test("enters a production match once and reports truthful loading stages", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  let createCalls = 0;
  let startCalls = 0;
  let acceptedStart: ReturnType<typeof startedMatchResponse> | null = null;
  const startCommandKeys: string[] = [];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "POST" && pathname === "/api/auth/v1/challenges") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(challengeResponse()),
      });
    }
    if (request.method() === "POST" && pathname === "/api/auth/v1/sessions") {
      return route.fulfill({
        status: 201,
        headers: {
          "Set-Cookie":
            "__Host-overgoal_session=match-entry; Path=/; Secure; HttpOnly; SameSite=Lax",
        },
        contentType: "application/json",
        body: JSON.stringify(sessionResponse()),
      });
    }
    if (request.method() === "GET" && pathname === "/api/auth/v1/session") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionResponse()),
      });
    }
    if (request.method() === "GET" && pathname === "/api/teams") {
      return route.fulfill({
        status: 200,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify({ teams }),
      });
    }
    if (request.method() === "POST" && pathname === "/api/createMatch") {
      createCalls += 1;
      expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
      return route.fulfill({
        status: 201,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify(createMatchResponse()),
      });
    }
    if (request.method() === "POST" && pathname === "/api/startMatch") {
      startCalls += 1;
      startCommandKeys.push(request.headers()["idempotency-key"] ?? "");
      expect(request.headers()["if-match-revision"]).toBe("1");
      expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (startCalls === 1) {
        return route.fulfill({
          status: 503,
          headers: apiHeaders,
          contentType: "application/json",
          body: JSON.stringify({
            error: "The match engine is warming up. Try again.",
            code: "MATCH_ENGINE_UNAVAILABLE",
            retryable: true,
          }),
        });
      }
      acceptedStart = startedMatchResponse();
      return route.fulfill({
        status: 200,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify(acceptedStart),
      });
    }
    if (
      request.method() === "GET" &&
      pathname === "/api/match/match-entry-e2e" &&
      acceptedStart
    ) {
      return route.fulfill({
        status: 200,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify({
          match: acceptedStart.match,
          my_team: teams[0],
          opponent_team: teams[1],
          timeline: acceptedStart.events,
          pending_action: acceptedStart.pending_action,
          field_state: acceptedStart.field_state,
        }),
      });
    }

    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Connect Controller" }).click();
  await expect(page).toHaveURL(/\/post-login-screen$/u);
  await page.getByRole("button", { name: "Continue" }).click();

  const createButton = page.getByRole("button", { name: "Play" });
  await expect(createButton).toBeVisible();
  await createButton.dblclick();
  await expect(page).toHaveURL(/\/pre-match\/match-entry-e2e$/u);
  expect(createCalls).toBe(1);

  const startButton = page.getByRole("button", { name: "Play" });
  await expect(startButton).toBeVisible();
  const startClickedAt = Date.now();
  await startButton.dblclick();

  const transition = page
    .getByRole("status")
    .filter({ hasText: "Starting Match" });
  await expect(transition).toBeVisible();
  const firstFeedbackMs = Date.now() - startClickedAt;
  expect(firstFeedbackMs).toBeLessThan(1_000);
  await expect(transition).toContainText("Match engine");
  await testInfo.attach("match-transition", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await expect(page).toHaveURL(/\/pre-match\/match-entry-e2e$/u);
  expect(startCalls).toBe(1);

  await expect(
    page.getByText("The match engine is warming up. Try again."),
  ).toBeVisible();
  const retryButton = page.getByRole("button", { name: "Retry" });
  await retryButton.dblclick();

  await expect(page).toHaveURL(/\/match\/match-entry-e2e$/u, {
    timeout: 60_000,
  });
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("00'", { exact: true })).toBeVisible();
  await expect(transition).toBeHidden();
  expect(startCalls).toBe(2);
  expect(startCommandKeys[0]).toBeTruthy();
  expect(startCommandKeys[1]).toBe(startCommandKeys[0]);

  const refreshedPage = await context.newPage();
  await refreshedPage.goto("/pre-match/match-entry-e2e");
  await expect(refreshedPage).toHaveURL(/\/match\/match-entry-e2e$/u, {
    timeout: 30_000,
  });
  await expect(
    refreshedPage.getByText("LIVE", { exact: true }).first(),
  ).toBeVisible();
  await refreshedPage.close();

  const refreshedTimelinePage = await context.newPage();
  await refreshedTimelinePage.goto("/match/match-entry-e2e");
  await expect(
    refreshedTimelinePage.getByText("LIVE", { exact: true }).first(),
  ).toBeVisible();
  await expect(refreshedTimelinePage).toHaveURL(/\/game$/u, {
    timeout: 45_000,
  });
  await refreshedTimelinePage.close();

  await testInfo.attach("match-entry-timing", {
    body: Buffer.from(
      JSON.stringify(
        {
          project: testInfo.project.name,
          firstFeedbackMs,
          startAttempts: startCalls,
          duplicateCommandReused: startCommandKeys[1] === startCommandKeys[0],
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});
