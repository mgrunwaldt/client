import { expect, type Locator, type Page, test } from "@playwright/test";

import type {
  BackendLastDecision,
  BackendMatchResponse,
  BackendMatchSnapshot,
  BackendUnsupportedSceneRecovery,
} from "../src/match/api-v1/contract";
import dribbleScene from "../tests/fixtures/match-api-v1/examples/scenes/dribble.json" with { type: "json" };
import jumperScene from "../tests/fixtures/match-api-v1/examples/scenes/jumper.json" with { type: "json" };
import createMatch from "../tests/fixtures/match-api-v1/fixtures/server/create-match-response.json" with { type: "json" };
import fulltimeResponse from "../tests/fixtures/match-api-v1/fixtures/server/fulltime-response.json" with { type: "json" };
import halftimeResponse from "../tests/fixtures/match-api-v1/fixtures/server/halftime-response.json" with { type: "json" };
import waitingOpenPlayResponse from "../tests/fixtures/match-api-v1/fixtures/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";
import { enableDebugResultContinuation } from "./support/result-continuation";

test.describe.configure({ timeout: 90_000 });

const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "m2-i7-recovery-e2e",
};

const teams = {
  myTeam: createMatch.my_team,
  opponentTeam: createMatch.opponent_team,
};

function lastDecisionFor(
  action: NonNullable<BackendMatchResponse["pending_action"]>,
  decisionData: Record<string, unknown>,
): BackendLastDecision {
  return {
    id: `decision-${action.id}`,
    match_id: action.field_state?.match_id ?? "match-fixture-1",
    sequence: 1,
    minute: action.minute,
    action: action.scene_type,
    action_team: action.action_team,
    action_id: action.id,
    action_version: action.contract_version ?? 1,
    decision_version: 1,
    decision_data: decisionData,
    field_state_id: action.field_state_id,
    timestamp: 1,
  };
}

function clonedResponseWithMatchId(
  source: BackendMatchResponse,
  matchId: string,
): BackendMatchResponse {
  const normalized = {
    ...source,
    match: {
      ...source.match,
      legend_player_id:
        source.match.legend_player_id ?? createMatch.match.legend_player_id,
      legend_profile:
        source.match.legend_profile ?? createMatch.match.legend_profile,
    },
  };
  return JSON.parse(
    JSON.stringify(normalized).replaceAll(source.match.id, matchId),
  ) as BackendMatchResponse;
}

function snapshotFromResponse(
  response: BackendMatchResponse,
): BackendMatchSnapshot {
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

function openPlayResponse(matchId: string) {
  const scene = structuredClone(
    waitingOpenPlayResponse,
  ) as BackendMatchResponse;
  return clonedResponseWithMatchId(
    {
      ...scene,
      match: {
        ...scene.match,
        my_team_id: createMatch.match.my_team_id,
        opponent_team_id: createMatch.match.opponent_team_id,
        legend_player_id: createMatch.match.legend_player_id,
        legend_profile: createMatch.match.legend_profile,
      },
      pending_settlement_events: [],
      unsupported_scene: null,
      legend_availability: {
        version: 1,
        status: "AVAILABLE",
        availability: "AVAILABLE",
        participation: "PARTICIPATING",
        interactive_controls: true,
        unavailable_since_minute: null,
      },
      halftime_summary: null,
      full_time_handoff: null,
      latest_operation: null,
    },
    matchId,
  );
}

async function routeSnapshot(
  page: Page,
  matchId: string,
  snapshot: () => BackendMatchSnapshot,
  delayMs = 0,
  onRequest?: () => void,
) {
  await page.context().route(`**/api/match/${matchId}`, async (route) => {
    onRequest?.();
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshot()),
    });
  });
}

async function dragFromBall(page: Page, target: Locator, release: boolean) {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("The live ball aim target is not measurable.");
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const end = { x: start.x - 72, y: start.y + 54 };

  if (test.info().project.name === "mobile-chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [end],
    });
    if (release) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  if (release) await page.mouse.up();
}

async function reverseDragFromBall(page: Page, target: Locator) {
  await dragFromBall(page, target, true);
}

async function beginReverseDragFromBall(page: Page, target: Locator) {
  await dragFromBall(page, target, false);
}

async function expectFieldPhase(
  page: Page,
  sessionPhase: string,
  interactionPhase: string,
) {
  const field = page.getByTestId("game-field");
  await expect(field).toHaveAttribute("data-session-phase", sessionPhase);
  await expect(field).toHaveAttribute(
    "data-interaction-phase",
    interactionPhase,
  );
}

function sceneResponse(
  scene: Record<string, unknown>,
  actionId: string,
): BackendMatchResponse {
  const base = openPlayResponse("m2-i7-bridge");
  const pendingAction = structuredClone(
    scene,
  ) as BackendMatchResponse["pending_action"];
  if (!pendingAction) throw new Error("Fixture must define a pending action.");
  pendingAction.id = actionId;
  if (pendingAction.field_state) {
    pendingAction.field_state.match_id = base.match.id;
  }
  return {
    ...base,
    minute: pendingAction.minute,
    prev_time: pendingAction.minute - 1,
    status: "WAITING_FOR_DECISION",
    pending_action: pendingAction,
    field_state: pendingAction.field_state ?? null,
    action: pendingAction.action_type,
    action_team: pendingAction.action_team,
    events: [
      {
        ...base.events[0],
        action: pendingAction.action_type,
        team: pendingAction.action_team,
        minute: pendingAction.minute,
        description: pendingAction.description,
      },
    ],
    match: {
      ...base.match,
      current_time: pendingAction.minute,
      prev_time: pendingAction.minute - 1,
      match_status: "WAITING_FOR_DECISION",
      pending_action: pendingAction,
    },
  };
}

const cases = [
  {
    id: "expired",
    status: 401,
    recoveryAction: "REAUTHENTICATE",
    label: "Sign in again",
  },
  {
    id: "forbidden",
    status: 403,
    recoveryAction: "CHECK_TRANSPORT",
    label: "Check connection",
  },
  {
    id: "stale",
    status: 409,
    recoveryAction: "HYDRATE_MATCH",
    label: "Refresh match state",
  },
  {
    id: "finished",
    status: 409,
    recoveryAction: "STOP",
    label: null,
  },
  {
    id: "missing",
    status: 404,
    recoveryAction: "STOP",
    label: null,
  },
  {
    id: "throttled",
    status: 429,
    recoveryAction: "RETRY_SAME_REQUEST",
    label: "Retry match",
  },
  {
    id: "timeout",
    status: 503,
    recoveryAction: "RETRY_SAME_REQUEST",
    label: "Retry match",
  },
] as const;

test("maps recoverable match hydration failures to explicit mobile-safe actions", async ({
  context,
  page,
}) => {
  await authenticateForContinuation(page);

  for (const entry of cases) {
    await context.route(`**/api/match/m2-i7-${entry.id}`, (route) =>
      route.fulfill({
        status: entry.status,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify({
          error: `Recovery case ${entry.id}.`,
          code: entry.id.toUpperCase(),
          retryable: entry.recoveryAction !== "STOP",
          recovery_action: entry.recoveryAction,
        }),
      }),
    );

    await page.goto(`/match/m2-i7-${entry.id}`);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText(`Recovery case ${entry.id}.`);
    if (entry.label) {
      await expect(
        page.getByRole("button", { name: entry.label }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: /retry|refresh|sign in|check/i }),
      ).toHaveCount(0);
    }
  }
});

test("provides terminal result recovery a safe home exit without retry", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-result-stop";
  let hydrationRequests = 0;
  let releaseFirstHydration = () => {};
  let markFirstHydrationStarted = () => {};
  const firstHydrationStarted = new Promise<void>((resolve) => {
    markFirstHydrationStarted = resolve;
  });
  const firstHydrationRelease = new Promise<void>((resolve) => {
    releaseFirstHydration = resolve;
  });
  await context.route(`**/api/match/${matchId}`, async (route) => {
    hydrationRequests += 1;
    if (hydrationRequests === 1) {
      markFirstHydrationStarted();
      await firstHydrationRelease;
    }
    return route.fulfill({
      status: 404,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The completed match is no longer available.",
        code: "MATCH_NOT_FOUND",
        retryable: false,
        recovery_action: "STOP",
      }),
    });
  });
  await authenticateForContinuation(page);
  await page.goto(`/match-result/${matchId}`);
  await firstHydrationStarted;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  releaseFirstHydration();

  await expect(page.getByRole("alert")).toContainText(
    "The completed match is no longer available.",
  );
  await expect(
    page.getByRole("button", { name: /retry|refresh|sign in|check/i }),
  ).toHaveCount(0);
  expect(hydrationRequests).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(250);
  expect(hydrationRequests).toBe(1);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/u);
});

test("clears only abandoned hydration loading across match-surface re-entry", async ({
  context,
  page,
}) => {
  const preMatchId = "m2-i7-abandoned-prematch";
  const preMatchSource = openPlayResponse(preMatchId);
  const preMatch = {
    ...preMatchSource,
    status: "NOT_STARTED" as const,
    prev_time: 0,
    pending_action: null,
    field_state: null,
    events: [],
    match: {
      ...preMatchSource.match,
      current_time: 0,
      prev_time: 0,
      match_status: "NOT_STARTED" as const,
      pending_action: null,
    },
  };
  const timelineId = "m2-i7-abandoned-timeline";
  const timeline = openPlayResponse(timelineId);
  const resultId = "m2-i7-abandoned-result";
  const result = clonedResponseWithMatchId(
    structuredClone(fulltimeResponse) as BackendMatchResponse,
    resultId,
  );
  const surfaces = [
    {
      id: preMatchId,
      path: `/pre-match/${preMatchId}`,
      response: preMatch,
      screen: page.getByTestId("prematch-screen"),
      play: true,
    },
    {
      id: timelineId,
      path: `/match/${timelineId}`,
      response: timeline,
      screen: page.getByTestId("timeline-screen"),
      play: false,
    },
    {
      id: resultId,
      path: `/match-result/${resultId}`,
      response: result,
      screen: page.getByTestId("match-result-screen"),
      play: false,
    },
  ];

  await authenticateForContinuation(page);

  for (const surface of surfaces) {
    let hydrations = 0;
    let releaseHydration!: () => void;
    const hydrationReleased = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    let hydrationStarted!: () => void;
    const hydrationInFlight = new Promise<void>((resolve) => {
      hydrationStarted = resolve;
    });
    await context.route(`**/api/match/${surface.id}`, async (route) => {
      hydrations += 1;
      if (hydrations === 2) {
        hydrationStarted();
        await hydrationReleased;
      }
      await route.fulfill({
        status: 200,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify(snapshotFromResponse(surface.response)),
      });
    });

    await page.goto(surface.path);
    await expect(surface.screen).toBeVisible();
    await expect(surface.screen).toHaveAttribute(
      "data-session-loading",
      "false",
    );
    await expect.poll(() => hydrations).toBe(1);

    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await hydrationInFlight;
    await page.evaluate(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/$/u);
    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, surface.path);

    await expect(surface.screen).toBeVisible();
    await expect(surface.screen).toHaveAttribute(
      "data-session-loading",
      "false",
    );
    if (surface.play) {
      await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
    }
    releaseHydration();
  }
});

test("hydrates Timeline offline without inventing state, then resumes on browser reconnect", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-offline-timeline";
  const response = openPlayResponse(matchId);
  let connected = true;
  let hydrateRequests = 0;
  let holdReconnect = false;
  let releaseReconnect!: () => void;
  const reconnectGate = new Promise<void>((resolve) => {
    releaseReconnect = resolve;
  });
  let markReconnectStarted!: () => void;
  const reconnectStarted = new Promise<void>((resolve) => {
    markReconnectStarted = resolve;
  });
  await context.route(`**/api/match/${matchId}`, (route) => {
    hydrateRequests += 1;
    if (!connected) return route.abort("internetdisconnected");
    if (holdReconnect) {
      markReconnectStarted();
      return reconnectGate.then(() =>
        route.fulfill({
          status: 200,
          headers: apiHeaders,
          contentType: "application/json",
          body: JSON.stringify(snapshotFromResponse(response)),
        }),
      );
    }
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFromResponse(response)),
    });
  });
  await authenticateForContinuation(page);
  await page.goto(`/match/${matchId}`);
  const timeline = page.getByTestId("timeline-screen");
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect.poll(() => hydrateRequests).toBe(1);
  // The route is visible as soon as hydration updates the store; allow its
  // transport-finally guard to clear before simulating a later reconnect.
  await page.waitForTimeout(50);

  connected = false;
  // The app only retries after a browser reconnect. Dispatching the event here
  // keeps the already-loaded Timeline route mounted while forcing its GET to
  // exercise the offline transport path.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("alert")).toContainText(/fetch|network|failed/i);
  await expect(page.getByTestId("timeline-screen")).toHaveCount(0);

  connected = true;
  holdReconnect = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await reconnectStarted;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  releaseReconnect();
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();
  expect(hydrateRequests).toBe(3);
});

test("retries one queued reconnect when the hydration active at the online event fails", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-queued-reconnect";
  const response = openPlayResponse(matchId);
  let hydrateRequests = 0;
  let holdNextFailure = false;
  let heldFailureCompleted = false;
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let markFailureStarted!: () => void;
  const failureStarted = new Promise<void>((resolve) => {
    markFailureStarted = resolve;
  });
  await context.route(`**/api/match/${matchId}`, async (route) => {
    hydrateRequests += 1;
    if (holdNextFailure && !heldFailureCompleted) {
      markFailureStarted();
      await failureGate;
      heldFailureCompleted = true;
      return route.abort("internetdisconnected");
    }
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFromResponse(response)),
    });
  });
  await authenticateForContinuation(page);
  await page.goto(`/match/${matchId}`);
  const timeline = page.getByTestId("timeline-screen");
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect.poll(() => hydrateRequests).toBe(1);
  await page.waitForTimeout(50);

  holdNextFailure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await failureStarted;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  releaseFailure();

  await expect.poll(() => hydrateRequests).toBe(3);
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("redirects the legacy game route instead of rendering an identity-free field", async ({
  page,
}) => {
  await authenticateForContinuation(page);
  await page.goto("/game");
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByTestId("game-field")).toHaveCount(0);
});

test("rehydrates a pre-match that has not started without issuing a start command", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-prematch-refresh";
  const response = openPlayResponse(matchId);
  const preMatch = {
    ...response,
    status: "NOT_STARTED" as const,
    prev_time: 0,
    pending_action: null,
    field_state: null,
    events: [],
    match: {
      ...response.match,
      current_time: 0,
      prev_time: 0,
      match_status: "NOT_STARTED" as const,
      pending_action: null,
    },
  };
  let starts = 0;
  let hydrations = 0;
  await routeSnapshot(
    page,
    matchId,
    () => snapshotFromResponse(preMatch),
    250,
    () => {
      hydrations += 1;
    },
  );
  await context.route("**/api/startMatch", (route) => {
    starts += 1;
    return route.abort("failed");
  });
  await authenticateForContinuation(page);
  await page.goto(`/pre-match/${matchId}`);
  const preMatchScreen = page.getByTestId("prematch-screen");
  await expect(preMatchScreen).toHaveAttribute("data-session-phase", "created");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.reload();
  await expect(preMatchScreen).toHaveAttribute("data-session-phase", "created");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  const reconnectBaseline = hydrations;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => hydrations).toBe(reconnectBaseline + 1);
  expect(starts).toBe(0);
});

test("blocks the previous match field while a new route identity hydrates", async ({
  context,
  page,
}) => {
  const firstMatchId = "m2-i7-route-first";
  const secondMatchId = "m2-i7-route-second";
  const first = openPlayResponse(firstMatchId);
  const second = openPlayResponse(secondMatchId);
  let releaseSecondHydration!: () => void;
  const secondHydrationGate = new Promise<void>((resolve) => {
    releaseSecondHydration = resolve;
  });
  let actionRequests = 0;

  await routeSnapshot(page, firstMatchId, () => snapshotFromResponse(first));
  await context.route(`**/api/match/${secondMatchId}`, async (route) => {
    await secondHydrationGate;
    await route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFromResponse(second)),
    });
  });
  await context.route("**/api/processMatchAction", async (route) => {
    actionRequests += 1;
    await route.abort("failed");
  });

  await authenticateForContinuation(page);
  await page.goto(`/game/${firstMatchId}`);
  const firstTarget = page.getByTestId("ball-aim-target");
  await expect(firstTarget).toBeVisible({
    timeout: 45_000,
  });
  await reverseDragFromBall(page, firstTarget);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/game/${secondMatchId}`);
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-session-phase",
    "hydrating",
  );
  await expect(page.getByTestId("ball-aim-target")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(actionRequests).toBe(0);

  releaseSecondHydration();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible({
    timeout: 45_000,
  });
  await expectFieldPhase(page, "scene_ready", "idle");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(actionRequests).toBe(0);
});

test("hydrates the exact contact draft and reconciles one ambiguous kick receipt", async ({
  context,
  page,
}) => {
  test.slow();
  const matchId = "m2-i7-ambiguous-kick";
  const initial = openPlayResponse(matchId);
  const submittedAction = initial.pending_action;
  const submittedFieldState = initial.field_state;
  if (!submittedAction || !submittedFieldState) {
    throw new Error("Open-play fixture must expose a pending field action.");
  }
  let actionRequests = 0;
  let committed = false;
  let committedDecision: Record<string, unknown> | null = null;
  const committedSnapshot = (): BackendMatchSnapshot => ({
    ...snapshotFromResponse(initial),
    match: {
      ...initial.match,
      revision: initial.match.revision + 1,
      match_status: "IN_PROGRESS",
      pending_action: null,
    },
    pending_action: null,
    field_state: null,
    latest_operation: {
      version: 1,
      operation_id: "m2-i7-committed-kick",
      operation: "processMatchAction",
      status: "COMMITTED",
      request_revision: initial.match.revision,
      committed_revision: initial.match.revision + 1,
      action_id: submittedAction.id,
      playback: {
        version: 1,
        submitted_action: submittedAction,
        submitted_field_state: submittedFieldState,
        last_decision: lastDecisionFor(
          submittedAction,
          committedDecision ?? { choice: "KICK" },
        ),
        decision_result: {
          description: "Successful pass.",
          success: true,
          outcome_type: "PASS_COMPLETED",
          flight_path: [
            { x: 50, y: 36, z: 0, t: 0 },
            { x: 54, y: 49, z: 0, t: 2 },
          ],
          final_point: { x: 54, y: 49, z: 0, t: 2 },
        },
        events: initial.events,
      },
    },
  });

  await routeSnapshot(page, matchId, () =>
    committed ? committedSnapshot() : snapshotFromResponse(initial),
  );
  await context.route("**/api/processMatchAction", async (route) => {
    actionRequests += 1;
    const body = route.request().postDataJSON() as {
      match_decision?: Record<string, unknown>;
    };
    committedDecision = body.match_decision ?? null;
    committed = true;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.abort("timedout");
  });
  await authenticateForContinuation(page);
  await enableDebugResultContinuation(page);
  await page.goto(`/game/${matchId}`);
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: 45_000 });
  await expectFieldPhase(page, "scene_ready", "idle");

  await beginReverseDragFromBall(page, target);
  await expectFieldPhase(page, "scene_ready", "aiming");
  await page.reload();
  await expect(target).toBeVisible({ timeout: 45_000 });
  await expectFieldPhase(page, "scene_ready", "idle");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await reverseDragFromBall(page, target);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectFieldPhase(page, "scene_ready", "contact_selection");
  await page.getByRole("gridcell", { name: "Upper right contact" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 45_000 });
  await expectFieldPhase(page, "scene_ready", "contact_selection");
  await expect(
    page.getByRole("gridcell", { name: "Upper right contact" }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("kick-submit").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => actionRequests).toBe(1);
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await expectFieldPhase(page, "recoverable_error", "blocked");
  await page.reload();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-result-animating",
    "true",
  );
  await expectFieldPhase(page, "result_playback", "result_playback");
  await expect(page.getByTestId("kick-result")).toContainText(
    "Successful pass.",
  );
  expect(actionRequests).toBe(1);

  const invalidDuringPlayback = {
    ...initial,
    match: {
      ...initial.match,
      revision: initial.match.revision + 1,
      match_status: "FUTURE_RESULT_PLAYBACK",
    },
  } as unknown as BackendMatchResponse;
  await page.evaluate(
    ({ response, myTeam, opponentTeam }) => {
      const bridge = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (...args: unknown[]) => void;
        }
      ).__OVERGOAL_E2E_SET_MATCH_RESPONSE__;
      if (!bridge) throw new Error("Match-session E2E bridge is unavailable.");
      bridge(response, myTeam, opponentTeam);
    },
    {
      response: invalidDuringPlayback,
      myTeam: teams.myTeam,
      opponentTeam: teams.opponentTeam,
    },
  );
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  await expectFieldPhase(page, "unsupported_contract", "blocked");

  await page.reload();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: 45_000,
  });
  await expectFieldPhase(page, "result_playback", "result_playback");
  expect(actionRequests).toBe(1);

  const nextAction = page.getByRole("button", {
    name: /Next action|Back to timeline/i,
  });
  if (await nextAction.isVisible()) await nextAction.click();
  await expect(page).toHaveURL(new RegExp(`/match/${matchId}$`, "u"), {
    timeout: 15_000,
  });
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
    { timeout: 15_000 },
  );
  await page.reload();
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
});

test("reconciles a committed action after leaving FIELD without duplicating it", async ({
  context,
  page,
}) => {
  test.slow();
  const matchId = "m2-i7-route-interruption";
  const initial = clonedResponseWithMatchId(
    sceneResponse(
      jumperScene as Record<string, unknown>,
      "m2-i7-route-interruption-action",
    ),
    matchId,
  );
  const submittedAction = initial.pending_action;
  const submittedFieldState = initial.field_state;
  if (!submittedAction || !submittedFieldState) {
    throw new Error("Random-event fixture must expose an authoritative scene.");
  }

  let committed = false;
  let submissions = 0;
  let hydrations = 0;
  let committedDecision: Record<string, unknown> = { choice: "ACCEPT_HUG" };
  let releaseAction!: () => void;
  const actionGate = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });
  let markActionStarted!: () => void;
  const actionStarted = new Promise<void>((resolve) => {
    markActionStarted = resolve;
  });

  const committedResponse = (): BackendMatchResponse => ({
    ...initial,
    minute: submittedAction.minute + 1,
    prev_time: submittedAction.minute,
    status: "IN_PROGRESS",
    pending_action: null,
    field_state: null,
    action: null,
    action_team: null,
    decision_result: {
      description: "You accept the hug and play continues.",
      success: true,
      outcome_type: "RANDOM_EVENT_RESOLVED",
      immediate_effects: {},
      pending_settlement_events: [],
    },
    match: {
      ...initial.match,
      revision: initial.match.revision + 1,
      current_time: submittedAction.minute + 1,
      prev_time: submittedAction.minute,
      match_status: "IN_PROGRESS",
      pending_action: null,
    },
    latest_operation: {
      version: 1,
      operation_id: "m2-i7-route-interruption-receipt",
      operation: "processMatchAction",
      status: "COMMITTED",
      request_revision: initial.match.revision,
      committed_revision: initial.match.revision + 1,
      action_id: submittedAction.id,
      playback: {
        version: 1,
        submitted_action: submittedAction,
        submitted_field_state: submittedFieldState,
        last_decision: lastDecisionFor(submittedAction, committedDecision),
        decision_result: {
          description: "You accept the hug and play continues.",
          success: true,
          outcome_type: "RANDOM_EVENT_RESOLVED",
          immediate_effects: {},
          pending_settlement_events: [],
        },
        events: initial.events,
      },
    },
  });

  await routeSnapshot(
    page,
    matchId,
    () =>
      committed
        ? snapshotFromResponse(committedResponse())
        : snapshotFromResponse(initial),
    0,
    () => {
      hydrations += 1;
    },
  );
  await context.route("**/api/processMatchAction", async (route) => {
    submissions += 1;
    const body = route.request().postDataJSON() as {
      match_decision?: Record<string, unknown>;
    };
    committedDecision = body.match_decision ?? committedDecision;
    committed = true;
    markActionStarted();
    await actionGate;
    await route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(committedResponse()),
    });
  });

  await authenticateForContinuation(page);
  await enableDebugResultContinuation(page);
  await page.goto(`/game/${matchId}`);
  await expect(page.getByTestId("random-event-scene")).toBeVisible({
    timeout: 45_000,
  });
  await page.getByTestId("random-event-choice-ACCEPT_HUG").click();
  await actionStarted;

  await page.evaluate((target) => {
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/match/${matchId}`);

  await expect.poll(() => hydrations).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/game/${matchId}$`, "u"), {
    timeout: 15_000,
  });
  await expect(page.getByTestId("kick-result")).toContainText(
    "You accept the hug and play continues.",
    { timeout: 45_000 },
  );
  await expectFieldPhase(page, "result_playback", "result_playback");
  releaseAction();
  await expect.poll(() => submissions).toBe(1);
  await page.waitForTimeout(250);
  expect(submissions).toBe(1);
});

test("maps expired, revoked, and stale action commands to explicit field recovery", async ({
  context,
}) => {
  test.slow();
  const cases = [
    {
      id: "auth-expired",
      status: 401,
      action: "REAUTHENTICATE",
      label: "Sign in again",
    },
    {
      id: "auth-revoked",
      status: 403,
      action: "REAUTHENTICATE",
      label: "Sign in again",
    },
    {
      id: "action-stale",
      status: 409,
      action: "HYDRATE_MATCH",
      label: "Refresh match state",
    },
  ] as const;
  await context.route("**/api/processMatchAction", (route) => {
    const command = route.request().postDataJSON() as { match_id: string };
    const entry = cases.find((candidate) =>
      command.match_id.includes(candidate.id),
    );
    if (!entry) return route.fallback();
    return route.fulfill({
      status: entry.status,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify({
        error: `Command ${entry.id}.`,
        code: entry.id.toUpperCase(),
        retryable: entry.status !== 409,
        recovery_action: entry.action,
      }),
    });
  });

  const authenticationPage = await context.newPage();
  await authenticateForContinuation(authenticationPage);
  await authenticationPage.close();

  for (const entry of cases) {
    const page = await context.newPage();
    const response = openPlayResponse(`m2-i7-${entry.id}`);
    await routeSnapshot(page, response.match.id, () =>
      snapshotFromResponse(response),
    );
    await page.goto(`/game/${response.match.id}`);
    const target = page.getByTestId("ball-aim-target");
    await expect(target).toBeVisible({ timeout: 45_000 });
    await expectFieldPhase(page, "scene_ready", "idle");
    await reverseDragFromBall(page, target);
    await page.getByTestId("kick-submit").click();
    await expect(page.getByTestId("scene-contract-error")).toContainText(
      `Command ${entry.id}.`,
    );
    await expect(page.getByRole("button", { name: entry.label })).toBeVisible();
    await expect(page.getByTestId("kick-result")).toHaveCount(0);
    await page.close();
  }
});

test("hydrates authoritative halftime and full-time routes rather than fabricating field state", async ({
  page,
}) => {
  const halftimeId = "m2-i7-halftime";
  const fulltimeId = "m2-i7-fulltime";
  const halftime = clonedResponseWithMatchId(
    structuredClone(halftimeResponse) as BackendMatchResponse,
    halftimeId,
  );
  const fulltime = clonedResponseWithMatchId(
    structuredClone(fulltimeResponse) as BackendMatchResponse,
    fulltimeId,
  );
  await routeSnapshot(
    page,
    halftimeId,
    () => snapshotFromResponse(halftime),
    250,
  );
  let fulltimeHydrations = 0;
  await routeSnapshot(
    page,
    fulltimeId,
    () => snapshotFromResponse(fulltime),
    250,
    () => {
      fulltimeHydrations += 1;
    },
  );
  await authenticateForContinuation(page);

  await page.goto(`/match/${halftimeId}`);
  const timeline = page.getByTestId("timeline-screen");
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await expect(timeline).toHaveAttribute("data-session-phase", "halftime");
  await expect(page.getByTestId("game-field")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await expect(timeline).toHaveAttribute("data-session-phase", "halftime");

  await page.goto(`/match/${fulltimeId}`);
  await expect(page).toHaveURL(new RegExp(`/match-result/${fulltimeId}$`, "u"));
  const result = page.getByTestId("match-result-screen");
  await expect(result).toHaveAttribute("data-session-phase", "finished");
  await expect(page.getByText(/Match report|Full time/i).first()).toBeVisible();
  await page.reload();
  await expect(result).toHaveAttribute("data-session-phase", "finished");
  await expect(page.getByText(/Match report|Full time/i).first()).toBeVisible();
  const reconnectBaseline = fulltimeHydrations;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => fulltimeHydrations).toBe(reconnectBaseline + 1);
});

test("rehydrates authoritative random-event and dribble inputs on both viewport classes", async ({
  page,
}) => {
  test.slow();
  await authenticateForContinuation(page);
  const randomMatchId = "m2-i7-jumper";
  const dribbleMatchId = "m2-i7-dribble";
  const random = clonedResponseWithMatchId(
    sceneResponse(
      jumperScene as Record<string, unknown>,
      "m2-i7-jumper-action",
    ),
    randomMatchId,
  );
  const dribble = clonedResponseWithMatchId(
    sceneResponse(
      dribbleScene as Record<string, unknown>,
      "m2-i7-dribble-action",
    ),
    dribbleMatchId,
  );
  await routeSnapshot(
    page,
    randomMatchId,
    () => snapshotFromResponse(random),
    250,
  );
  await routeSnapshot(
    page,
    dribbleMatchId,
    () => snapshotFromResponse(dribble),
    250,
  );

  await page.goto(`/game/${randomMatchId}`);
  await expect(page.getByTestId("random-event-scene")).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page.getByTestId("random-event-choice-ACCEPT_HUG"),
  ).toBeVisible();
  await expectFieldPhase(page, "scene_ready", "idle");
  await page.reload();
  await expect(page.getByTestId("random-event-scene")).toBeVisible({
    timeout: 45_000,
  });
  await expectFieldPhase(page, "scene_ready", "idle");

  await page.goto(`/game/${dribbleMatchId}`);
  await expect(page.getByTestId("dribble-controls")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("random-event-scene")).toHaveCount(0);
  await expectFieldPhase(page, "scene_ready", "idle");
  await page.reload();
  await expect(page.getByTestId("dribble-controls")).toBeVisible({
    timeout: 45_000,
  });
  await expectFieldPhase(page, "scene_ready", "idle");
});

test("retries ambiguous random-event and dribble commands with the exact persisted payload and key", async ({
  context,
  page,
}) => {
  test.slow();
  const requests: Array<{
    matchId: string;
    key: string | undefined;
    body: unknown;
  }> = [];
  await context.route("**/api/processMatchAction", (route) => {
    const body = route.request().postDataJSON() as { match_id: string };
    requests.push({
      matchId: body.match_id,
      key: route.request().headers()["idempotency-key"],
      body,
    });
    return route.abort("timedout");
  });
  await authenticateForContinuation(page);

  const randomMatchId = "m2-i7-ambiguous-random";
  const random = clonedResponseWithMatchId(
    sceneResponse(
      jumperScene as Record<string, unknown>,
      "m2-i7-ambiguous-random-action",
    ),
    randomMatchId,
  );
  await routeSnapshot(page, randomMatchId, () => snapshotFromResponse(random));
  await page.goto(`/game/${randomMatchId}`);
  await expect(page.getByTestId("random-event-choice-ACCEPT_HUG")).toBeVisible({
    timeout: 45_000,
  });
  await page.getByTestId("random-event-choice-ACCEPT_HUG").click();
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry exact action" }),
  ).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Retry exact action" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual(requests[0]);

  await page.evaluate(() => window.sessionStorage.clear());

  const dribbleMatchId = "m2-i7-ambiguous-dribble";
  const dribble = clonedResponseWithMatchId(
    sceneResponse(
      dribbleScene as Record<string, unknown>,
      "m2-i7-ambiguous-dribble-action",
    ),
    dribbleMatchId,
  );
  await routeSnapshot(page, dribbleMatchId, () =>
    snapshotFromResponse(dribble),
  );
  await page.goto(`/game/${dribbleMatchId}`);
  await expect(page.getByTestId("dribble-controls")).toBeVisible({
    timeout: 45_000,
  });
  await page.evaluate(() => {
    const bridge = globalThis as typeof globalThis & {
      __OVERGOAL_E2E_DRIBBLE_ADVANCE__?: (second: number) => void;
    };
    bridge.__OVERGOAL_E2E_DRIBBLE_ADVANCE__?.(8);
  });
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry exact action" }),
  ).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Retry exact action" }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3]).toEqual(requests[2]);
});

test("reconciles an ambiguous unsupported-scene recovery receipt without field playback", async ({
  context,
  page,
}) => {
  const matchId = "m2-i7-unknown-recovery";
  const unknown = openPlayResponse(matchId);
  const actionId = "m2-i7-unknown-action";
  const recovery: BackendUnsupportedSceneRecovery = {
    version: 1 as const,
    status: "RECOVERY_REQUIRED" as const,
    code: "UNSUPPORTED_SCENE_TYPE",
    scene_type: "FUTURE_RANDOM_EVENT_V99",
    contract_version: null,
    supported_contract_version: null,
    action_id: actionId,
    action_sequence: 1,
    minute: unknown.minute,
    recovery: {
      choice: "CONTINUE_WITHOUT_EVENT",
      label: "Continue Without Event",
      description: "Skip unsupported event content without applying effects.",
      input_schema: {
        type: "object",
        required: ["choice"],
        allowed: ["choice"],
        additional_properties: false,
      },
    },
  };
  const unknownSnapshot = (): BackendMatchSnapshot => ({
    ...snapshotFromResponse(unknown),
    match: {
      ...unknown.match,
      match_status: "WAITING_FOR_RECOVERY",
      pending_action: null,
    },
    pending_action: null,
    field_state: null,
    unsupported_scene: recovery,
  });
  let committed = false;
  let submissions = 0;
  const resolvedSnapshot = (): BackendMatchSnapshot => ({
    ...snapshotFromResponse(unknown),
    match: {
      ...unknown.match,
      revision: unknown.match.revision + 1,
      current_time: unknown.minute + 1,
      prev_time: unknown.minute,
      match_status: "IN_PROGRESS",
      pending_action: null,
    },
    timeline: [
      {
        ...unknown.events[0],
        event_id: unknown.events[0].event_id + 1,
        minute: unknown.minute,
        action: "UNSUPPORTED_SCENE_SKIPPED",
        description: "Unsupported scene skipped without applying effects.",
      },
    ],
    pending_action: null,
    field_state: null,
    unsupported_scene: null,
    latest_operation: {
      version: 1,
      operation_id: "m2-i7-unknown-receipt",
      operation: "processMatchAction",
      status: "COMMITTED",
      request_revision: unknown.match.revision,
      committed_revision: unknown.match.revision + 1,
      action_id: actionId,
      playback: {
        version: 1,
        submitted_action: null,
        submitted_field_state: null,
        last_decision: {
          id: `decision-${actionId}`,
          match_id: matchId,
          sequence: 1,
          minute: recovery.minute,
          action: "RANDOM_EVENT",
          action_team: "NEUTRAL",
          action_id: actionId,
          action_version: 1,
          decision_version: 5,
          decision_data: {
            choice: "CONTINUE_WITHOUT_EVENT",
            unsupported_scene_type: recovery.scene_type,
          },
          field_state_id: unknown.field_state?.id ?? "unknown-field-state",
          timestamp: 1,
        },
        decision_result: {
          description: "Unsupported scene skipped without applying effects.",
          success: true,
          outcome_type: "SKIPPED_NO_EFFECT",
          immediate_effects: {},
          pending_settlement_events: [],
          unsupported_scene_recovery: {
            version: 1,
            status: "RECOVERED",
            outcome: "SKIPPED_NO_EFFECT",
            scene_type: recovery.scene_type,
            action_id: actionId,
            recovered_revision: unknown.match.revision + 1,
          },
        },
        events: [
          {
            ...unknown.events[0],
            event_id: unknown.events[0].event_id + 1,
            minute: unknown.minute,
            action: "UNSUPPORTED_SCENE_SKIPPED",
            description: "Unsupported scene skipped without applying effects.",
          },
        ],
      },
    },
  });
  await routeSnapshot(page, matchId, () =>
    committed ? resolvedSnapshot() : unknownSnapshot(),
  );
  await context.route("**/api/processMatchAction", (route) => {
    submissions += 1;
    committed = true;
    return route.abort("timedout");
  });
  await authenticateForContinuation(page);
  await page.goto(`/game/${matchId}`);
  await expect(page.getByTestId("unsupported-event-recovery")).toBeVisible();
  await expectFieldPhase(page, "unsupported_recovery", "idle");
  await page.getByTestId("unsupported-event-continue").click();
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await page
    .getByTestId("scene-contract-error")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/match/${matchId}$`, "u"));
  const timeline = page.getByTestId("timeline-screen");
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  expect(submissions).toBe(1);
});

test("shows a recoverable field error when a required match asset fails", async ({
  context,
  page,
}) => {
  test.slow();
  const matchId = "m2-i7-asset-failure";
  const response = openPlayResponse(matchId);
  await routeSnapshot(page, matchId, () => snapshotFromResponse(response));
  await context.route("**/models/in-game/Ball/Ball.glb", (route) =>
    route.abort("failed"),
  );
  await authenticateForContinuation(page);
  await page.goto(`/game/${matchId}`);
  await expect(page.getByTestId("scene-contract-error")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("scene-contract-error")).toContainText(
    "Unable to load match asset",
  );
  await expectFieldPhase(page, "recoverable_error", "blocked");
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
});
