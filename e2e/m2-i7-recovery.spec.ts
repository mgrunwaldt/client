import { expect, type Locator, type Page, test } from "@playwright/test";

import type {
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

test.describe.configure({ timeout: 90_000 });

const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "m2-i7-recovery-e2e",
};

const teams = {
  myTeam: createMatch.my_team,
  opponentTeam: createMatch.opponent_team,
};

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
) {
  await page.context().route(`**/api/match/${matchId}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshot()),
    }),
  );
}

async function reverseDragFromBall(page: Page, target: Locator) {
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
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

async function hydrateBridge(page: Page, response: BackendMatchResponse) {
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await page.evaluate(
    ({ value, myTeam, opponentTeam }) => {
      const bridge = globalThis as typeof globalThis & {
        __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
          response: unknown,
          team: unknown,
          opponent: unknown,
        ) => void;
        __OVERGOAL_E2E_ADVANCE_TO_SCENE__?: (minute: number) => void;
      };
      if (
        !bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__ ||
        !bridge.__OVERGOAL_E2E_ADVANCE_TO_SCENE__
      ) {
        throw new Error("Match session browser-test bridge is unavailable");
      }
      bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__(value, myTeam, opponentTeam);
      bridge.__OVERGOAL_E2E_ADVANCE_TO_SCENE__(value.minute);
    },
    { value: response, ...teams },
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
  await expect(page.getByTestId("timeline-screen")).toBeVisible();

  connected = false;
  await context.setOffline(true);
  // The app only retries after a browser reconnect. Dispatching the event here
  // keeps the already-loaded Timeline route mounted while forcing its GET to
  // exercise the offline transport path.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("alert")).toContainText(/fetch|network|failed/i);
  await expect(page.getByTestId("timeline-screen")).toHaveCount(0);

  connected = true;
  holdReconnect = true;
  await context.setOffline(false);
  await reconnectStarted;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  releaseReconnect();
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();
  expect(hydrateRequests).toBe(3);
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
  await routeSnapshot(page, matchId, () => snapshotFromResponse(preMatch));
  await context.route("**/api/startMatch", (route) => {
    starts += 1;
    return route.abort("failed");
  });
  await authenticateForContinuation(page);
  await page.goto(`/pre-match/${matchId}`);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  expect(starts).toBe(0);
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
        last_decision: { choice: "KICK" },
        decision_result: {
          description: "Successful pass.",
          success: true,
          outcome_type: "PASS_COMPLETED",
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
    committed = true;
    await route.abort("timedout");
  });
  await authenticateForContinuation(page);
  await page.goto(`/game/${matchId}`);
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: 45_000 });
  await reverseDragFromBall(page, target);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("gridcell", { name: "Top right contact" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 45_000 });
  await expect(
    page.getByRole("gridcell", { name: "Top right contact" }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("kick-submit").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  expect(actionRequests).toBe(1);
  await page.reload();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("kick-result")).toContainText(
    "Successful pass.",
  );
  expect(actionRequests).toBe(1);
  await page.reload();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: 45_000,
  });
  expect(actionRequests).toBe(1);
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

  for (const entry of cases) {
    const page = await context.newPage();
    await authenticateForContinuation(page);
    await hydrateBridge(page, openPlayResponse(`m2-i7-${entry.id}`));
    const target = page.getByTestId("ball-aim-target");
    await expect(target).toBeVisible({ timeout: 45_000 });
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
  await routeSnapshot(page, halftimeId, () => snapshotFromResponse(halftime));
  await routeSnapshot(page, fulltimeId, () => snapshotFromResponse(fulltime));
  await authenticateForContinuation(page);

  await page.goto(`/match/${halftimeId}`);
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await expect(page.getByTestId("game-field")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("halftime-panel")).toBeVisible();

  await page.goto(`/match/${fulltimeId}`);
  await expect(page).toHaveURL(new RegExp(`/match-result/${fulltimeId}$`, "u"));
  await expect(page.getByText(/Match report|Full time/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Match report|Full time/i).first()).toBeVisible();
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
  await routeSnapshot(page, randomMatchId, () => snapshotFromResponse(random));
  await routeSnapshot(page, dribbleMatchId, () =>
    snapshotFromResponse(dribble),
  );

  await page.goto(`/game/${randomMatchId}`);
  await expect(page.getByTestId("random-event-scene")).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page.getByTestId("random-event-choice-ACCEPT_HUG"),
  ).toBeVisible();

  await page.goto(`/game/${dribbleMatchId}`);
  await expect(page.getByTestId("dribble-controls")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("random-event-scene")).toHaveCount(0);
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
        last_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
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
  await page.getByTestId("unsupported-event-continue").click();
  await expect(page.getByTestId("scene-contract-error")).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page).toHaveURL(new RegExp(`/match/${matchId}$`, "u"));
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
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
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
});
