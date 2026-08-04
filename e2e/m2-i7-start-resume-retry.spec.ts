import { expect, type Route, test } from "@playwright/test";

import type {
  BackendMatchResponse,
  BackendMatchSnapshot,
} from "../src/match/api-v1/contract";
import createMatchResponse from "../tests/fixtures/match-api-v1/fixtures/server/create-match-response.json" with { type: "json" };
import halftimeResponse from "../tests/fixtures/match-api-v1/fixtures/server/halftime-response.json" with { type: "json" };
import waitingOpenPlayResponse from "../tests/fixtures/match-api-v1/fixtures/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";

test.describe.configure({ timeout: 90_000 });

const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "m2-i7-start-resume-retry-e2e",
};

const teams = {
  myTeam: createMatchResponse.my_team,
  opponentTeam: createMatchResponse.opponent_team,
};

interface RequestEvidence {
  body: string;
  idempotencyKey: string;
}

function responseWithMatchId<T>(source: T, matchId: string): T {
  return JSON.parse(
    JSON.stringify(source).replaceAll("match-fixture-1", matchId),
  ) as T;
}

function snapshotFrom(response: BackendMatchResponse): BackendMatchSnapshot {
  return {
    match: response.match,
    my_team: teams.myTeam,
    opponent_team: teams.opponentTeam,
    timeline: response.events,
    pending_action: response.pending_action,
    field_state: response.field_state,
    pending_settlement_events: response.pending_settlement_events,
    unsupported_scene: response.unsupported_scene,
    legend_availability: response.legend_availability,
    halftime_summary: response.halftime_summary,
    full_time_handoff: response.full_time_handoff,
    latest_operation: response.latest_operation ?? null,
  };
}

function startedMatch(matchId: string): BackendMatchResponse {
  const response = responseWithMatchId(
    structuredClone(waitingOpenPlayResponse) as BackendMatchResponse,
    matchId,
  );
  return {
    ...response,
    match: {
      ...response.match,
      revision: 1,
    },
  };
}

function resumedSecondHalf(matchId: string): BackendMatchResponse {
  const response = responseWithMatchId(
    structuredClone(waitingOpenPlayResponse) as BackendMatchResponse,
    matchId,
  );
  return {
    ...response,
    minute: 46,
    prev_time: 45,
    status: "IN_PROGRESS",
    pending_action: null,
    field_state: null,
    action: "RESUME_MATCH",
    action_team: "NEUTRAL",
    events: [
      {
        ...response.events[0],
        event_id: 46,
        minute: 46,
        action: "RESUME_MATCH",
        team: "NEUTRAL",
        description: "Second half resumed.",
        player_participates: false,
      },
    ],
    legend_availability: {
      ...response.legend_availability,
      participation: "PARTICIPATING",
    },
    match: {
      ...response.match,
      revision: 2,
      current_time: 46,
      prev_time: 45,
      match_status: "IN_PROGRESS",
      pending_action: null,
      player_participation: "PARTICIPATING",
    },
  };
}

function prematchSnapshot(matchId: string): BackendMatchSnapshot {
  const response = responseWithMatchId(
    structuredClone(createMatchResponse) as Pick<
      BackendMatchSnapshot,
      "match" | "my_team" | "opponent_team"
    >,
    matchId,
  );
  return {
    match: response.match,
    my_team: response.my_team,
    opponent_team: response.opponent_team,
    timeline: [],
    pending_action: null,
    field_state: null,
    legend_availability: {
      version: 1,
      status: "AVAILABLE",
      availability: "AVAILABLE",
      participation: "NOT_PARTICIPATING",
      interactive_controls: true,
      unavailable_since_minute: null,
    },
    pending_settlement_events: [],
    unsupported_scene: null,
    halftime_summary: null,
    full_time_handoff: null,
    latest_operation: null,
  };
}

function retrySameRequestError(operation: "start" | "resume") {
  return {
    error: `The authoritative ${operation} request can be retried.`,
    code: "MATCH_ENGINE_UNAVAILABLE",
    retryable: true,
    recovery_action: "RETRY_SAME_REQUEST",
  };
}

function hydrationRequiredError(operation: "start" | "resume") {
  return {
    error: `The ${operation} request outcome is ambiguous.`,
    code: "MATCH_ENGINE_UNAVAILABLE",
    retryable: true,
    recovery_action: "HYDRATE_MATCH",
  };
}

function recordRequest(route: Route): RequestEvidence {
  const request = route.request();
  const body = request.postData();
  const idempotencyKey = request.headers()["idempotency-key"];
  if (body === null || !idempotencyKey) {
    throw new Error(
      "Retryable match commands require a body and Idempotency-Key.",
    );
  }
  return { body, idempotencyKey };
}

test("retries a rejected prematch start with the exact command identity", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-start-retry";
  const created = prematchSnapshot(matchId);
  const accepted = startedMatch(matchId);
  const requests: RequestEvidence[] = [];

  await context.route(`**/api/match/${matchId}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(created),
    }),
  );
  await context.route("**/api/startMatch", async (route) => {
    requests.push(recordRequest(route));
    await route.fulfill({
      status: requests.length === 1 ? 503 : 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(
        requests.length === 1 ? retrySameRequestError("start") : accepted,
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.goto(`/pre-match/${matchId}`);
  await expect(page.getByTestId("prematch-screen")).toBeVisible();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "authoritative start request",
  );
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);

  await expect(page).toHaveURL(new RegExp(`/(?:match|game)/${matchId}$`, "u"));
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("hydrates an ambiguous prematch start before allowing the exact retry", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-start-hydration-first";
  const created = prematchSnapshot(matchId);
  const accepted = startedMatch(matchId);
  const requests: RequestEvidence[] = [];
  let hydrations = 0;

  await context.route(`**/api/match/${matchId}`, (route) => {
    hydrations += 1;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(created),
    });
  });
  await context.route("**/api/startMatch", async (route) => {
    requests.push(recordRequest(route));
    await route.fulfill({
      status: requests.length === 1 ? 503 : 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(
        requests.length === 1 ? hydrationRequiredError("start") : accepted,
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.goto(`/pre-match/${matchId}`);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  expect(requests).toHaveLength(1);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => hydrations).toBe(2);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(requests).toHaveLength(1);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(page).toHaveURL(new RegExp(`/(?:match|game)/${matchId}$`, "u"));
});

test("clears an owned start loader when prematch is left before the response", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-stale-start-loader";
  const created = prematchSnapshot(matchId);
  const accepted = startedMatch(matchId);
  let releaseStart!: () => void;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });

  await context.route(`**/api/match/${matchId}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(created),
    }),
  );
  await context.route("**/api/startMatch", async (route) => {
    await startGate;
    await route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(accepted),
    });
  });

  await authenticateForContinuation(page);
  await page.goto(`/pre-match/${matchId}`);
  await page.getByRole("button", { name: "Play" }).click();
  const transition = page
    .getByRole("status")
    .filter({ hasText: "Starting Match" });
  await expect(transition).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/$/u);
  await expect(transition).toBeHidden();

  releaseStart();
  await page.waitForTimeout(250);
  await expect(transition).toBeHidden();
});

test("retries a rejected halftime resume with the exact command identity", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-resume-retry";
  const halftime = responseWithMatchId(
    structuredClone(halftimeResponse) as BackendMatchResponse,
    matchId,
  );
  const accepted = resumedSecondHalf(matchId);
  const requests: RequestEvidence[] = [];

  await context.route(`**/api/match/${matchId}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFrom(halftime)),
    }),
  );
  await context.route("**/api/resumeMatch", async (route) => {
    requests.push(recordRequest(route));
    await route.fulfill({
      status: requests.length === 1 ? 503 : 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(
        requests.length === 1 ? retrySameRequestError("resume") : accepted,
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.goto(`/match/${matchId}`);
  await expect(page.getByTestId("halftime-panel")).toBeVisible();

  await page.getByTestId("continue-second-half").click();
  await expect(page.getByRole("alert")).toContainText(
    "authoritative resume request",
  );
  await expect(
    page.getByRole("button", { name: "Retry same request" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);

  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "46",
  );
});

test("reconciles a committed halftime resume after leaving TIMELINE", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-stale-resume";
  const halftime = responseWithMatchId(
    structuredClone(halftimeResponse) as BackendMatchResponse,
    matchId,
  );
  const accepted = resumedSecondHalf(matchId);
  let committed = false;
  let hydrations = 0;
  const requests: RequestEvidence[] = [];
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => {
    releaseResume = resolve;
  });
  let markResumeStarted!: () => void;
  const resumeStarted = new Promise<void>((resolve) => {
    markResumeStarted = resolve;
  });

  await context.route(`**/api/match/${matchId}`, (route) => {
    hydrations += 1;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFrom(committed ? accepted : halftime)),
    });
  });
  await context.route("**/api/resumeMatch", async (route) => {
    requests.push(recordRequest(route));
    committed = true;
    markResumeStarted();
    await resumeGate;
    await route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(accepted),
    });
  });

  await authenticateForContinuation(page);
  await page.goto(`/match/${matchId}`);
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await page.getByTestId("continue-second-half").click();
  await resumeStarted;

  await page.evaluate(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/$/u);
  releaseResume();

  await page.goto(`/match/${matchId}`);
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "46",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(hydrations).toBeGreaterThanOrEqual(2);
});
