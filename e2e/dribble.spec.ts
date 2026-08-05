import { expect, type Page, test } from "@playwright/test";

import { BackendMatchResponseSchema } from "../src/match/api-v1/contract";
import dribbleScene from "../tests/fixtures/match-api-v1/examples/scenes/dribble.json" with { type: "json" };
import waitingOpenPlay from "../tests/fixtures/match-api-v1/fixtures/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";
import { withCommittedActionReceipt } from "./support/operation-receipt";
import { enableDebugResultContinuation } from "./support/result-continuation";

const FIELD_READY_TIMEOUT_MS = 90_000;
const DRIBBLE_OUTCOMES = [
  {
    outcomeType: "DRIBBLE_SURVIVAL",
    choice: "DRIBBLE_RUN",
    success: true,
    followUpScene: "OPEN_PLAY",
  },
  {
    outcomeType: "DRIBBLE_COLLISION_LOSS",
    choice: "DRIBBLE_RUN",
    success: false,
    loosePossession: true,
  },
  {
    outcomeType: "DRIBBLE_FOUL_FREE_KICK",
    choice: "DRIBBLE_RUN",
    success: true,
    followUpScene: "FREE_KICK",
  },
  {
    outcomeType: "DRIBBLE_FOUL_PENALTY",
    choice: "DRIBBLE_RUN",
    success: true,
    followUpScene: "PENALTY",
  },
  {
    outcomeType: "SIMULATION_FREE_KICK",
    choice: "SIMULATE_FOUL",
    success: true,
    followUpScene: "FREE_KICK",
  },
  {
    outcomeType: "SIMULATION_PENALTY",
    choice: "SIMULATE_FOUL",
    success: true,
    followUpScene: "PENALTY",
  },
  {
    outcomeType: "SIMULATION_BOOKING",
    choice: "SIMULATE_FOUL",
    success: false,
    yellowCard: true,
  },
  {
    outcomeType: "SIMULATION_NO_CALL_LOSS",
    choice: "SIMULATE_FOUL",
    success: false,
    loosePossession: true,
  },
] as const;

type DribbleOutcomeCase = (typeof DRIBBLE_OUTCOMES)[number];

const teams = {
  myTeam: {
    id: "team_1",
    name: "Dojo United",
    offense: 78,
    defense: 75,
    intensity: 80,
  },
  opponentTeam: {
    id: "team_2",
    name: "Cartridge City",
    offense: 85,
    defense: 68,
    intensity: 72,
  },
};

function dribbleResponse(actionId = "action-dribble-1", revision = 0) {
  const response = structuredClone(waitingOpenPlay);
  const pendingAction = structuredClone(dribbleScene);
  pendingAction.id = actionId;
  return {
    ...response,
    minute: pendingAction.minute,
    prev_time: pendingAction.minute - 1,
    action: pendingAction.action_type,
    action_team: pendingAction.action_team,
    pending_action: pendingAction,
    field_state: pendingAction.field_state,
    events: [
      {
        ...response.events[0],
        action: "DRIBBLE",
        description: pendingAction.description,
        minute: pendingAction.minute,
      },
    ],
    match: {
      ...response.match,
      revision,
      current_time: pendingAction.minute,
      prev_time: pendingAction.minute - 1,
      match_status: "WAITING_FOR_DECISION",
      pending_action: pendingAction,
    },
  };
}

function resolvedDribble(
  outcome: DribbleOutcomeCase,
  actionId: string,
  revision = 0,
) {
  const response = dribbleResponse(actionId, revision);
  const minute = response.minute + 1;
  return {
    ...response,
    minute,
    prev_time: response.minute,
    status: "IN_PROGRESS",
    pending_action: null,
    field_state: null,
    action: null,
    action_team: null,
    events: [
      {
        ...response.events[0],
        event_id: response.events[0].event_id + 1,
        minute,
        description: `Authoritative ${outcome.outcomeType} result.`,
      },
    ],
    match: {
      ...response.match,
      current_time: minute,
      prev_time: response.minute,
      revision: response.match.revision + 1,
      match_status: "IN_PROGRESS",
      event_counter: response.events[0].event_id + 1,
      pending_action: null,
    },
    decision_result: {
      description: `Authoritative ${outcome.outcomeType} result.`,
      success: outcome.success,
      outcome_type: outcome.outcomeType,
      follow_up_scene:
        "followUpScene" in outcome ? outcome.followUpScene : null,
      loose_possession:
        "loosePossession" in outcome ? outcome.loosePossession : false,
      yellow_card: "yellowCard" in outcome ? outcome.yellowCard : false,
      simulation_resolution:
        outcome.choice === "SIMULATE_FOUL" ? { chance_percent: 53 } : null,
    },
  };
}

function committedDribble(
  outcome: DribbleOutcomeCase,
  actionId: string,
  decisionData: Record<string, unknown>,
  revision = 0,
) {
  const submitted = dribbleResponse(actionId, revision);
  const resolved = resolvedDribble(outcome, actionId, revision);
  return withCommittedActionReceipt(submitted, resolved, {
    decisionData,
    operationId: `operation-${actionId}`,
  });
}

function validMatchResponse(value: unknown) {
  const parsed = BackendMatchResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid dribble fixture response: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

async function hydrateDribble(
  page: Page,
  response: ReturnType<typeof dribbleResponse> = dribbleResponse(),
) {
  const gamePath = `/game/${response.match.id}`;
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await page.evaluate(
    ({ response, myTeam, opponentTeam }) => {
      const setMatchResponse = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
            matchResponse: unknown,
            team: unknown,
            opponent: unknown,
          ) => void;
        }
      ).__OVERGOAL_E2E_SET_MATCH_RESPONSE__;
      const advance = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_ADVANCE_TO_SCENE__?: (minute: number) => void;
        }
      ).__OVERGOAL_E2E_ADVANCE_TO_SCENE__;
      if (!setMatchResponse || !advance)
        throw new Error("E2E bridge unavailable");
      setMatchResponse(response, myTeam, opponentTeam);
      advance((response as { minute: number }).minute);
    },
    { response, ...teams },
  );
  if (new URL(page.url()).pathname !== gamePath) {
    await page.evaluate((pathname) => {
      window.history.pushState({}, "", pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, gamePath);
    await expect(page).toHaveURL(new RegExp(`${gamePath}$`, "u"));
  }
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-render-ready",
    "true",
    { timeout: FIELD_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("dribble-controls")).toBeVisible();
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_DRIBBLE_ADVANCE__" in globalThis,
  );
}

async function tapDribbleScreenSide(
  page: Page,
  side: "left" | "right",
  mobile: boolean,
) {
  const target = page.getByTestId(`dribble-screen-${side}`);
  await expect(target).toBeEnabled();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The dribble viewport is not measurable.");
  const position = {
    x: side === "left" ? 20 : viewport.width - 20,
    y: Math.round(viewport.height * 0.75),
  };
  if (mobile) {
    await page.touchscreen.tap(position.x, position.y);
    return;
  }
  await page.mouse.click(position.x, position.y);
}

async function dribblePlayerHudGeometry(page: Page) {
  const legend = page.getByTestId("legend-player-anchor");
  const defender = page.getByTestId("dribble-defender-anchor");
  await expect(legend).toHaveCount(1);
  await expect(defender).toHaveCount(1);

  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>(
      '[data-testid="dribble-controls"]',
    );
    const legendAnchor = document.querySelector<HTMLElement>(
      '[data-testid="legend-player-anchor"]',
    );
    const defenderAnchor = document.querySelector<HTMLElement>(
      '[data-testid="dribble-defender-anchor"]',
    );
    if (!hud || !legendAnchor || !defenderAnchor) {
      throw new Error("Dribble composition anchors are unavailable.");
    }

    const bounds = (element: HTMLElement) => {
      const { bottom, left, right, top } = element.getBoundingClientRect();
      return { bottom, left, right, top };
    };
    return {
      defender: bounds(defenderAnchor),
      hud: bounds(hud),
      legend: bounds(legendAnchor),
      viewportHeight: window.innerHeight,
    };
  });
}

function expectDribblePlayersClearOfHud(
  geometry: Awaited<ReturnType<typeof dribblePlayerHudGeometry>>,
) {
  const requiredClearance = 28;
  expect(geometry.hud.top).toBeGreaterThanOrEqual(0);
  expect(geometry.hud.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  for (const player of [geometry.legend, geometry.defender]) {
    expect(player.top).toBeGreaterThanOrEqual(0);
    expect(player.top).toBeGreaterThan(geometry.hud.bottom + requiredClearance);
    expect(player.bottom).toBeLessThan(
      geometry.viewportHeight - requiredClearance,
    );
  }
}

async function advanceDribble(page: Page, second: number) {
  await expect
    .poll(() =>
      page.evaluate((nextSecond) => {
        const advance = (
          globalThis as typeof globalThis & {
            __OVERGOAL_E2E_DRIBBLE_ADVANCE__?: (value: number) => void;
          }
        ).__OVERGOAL_E2E_DRIBBLE_ADVANCE__;
        if (!advance) return false;
        advance(nextSecond);
        return true;
      }, second),
    )
    .toBe(true);
}

async function readDribbleState(page: Page) {
  let state: {
    elapsed: number;
    trace: Array<{ at_second: number; lane: string }>;
  } | null = null;
  await expect
    .poll(async () => {
      state = await page.evaluate(() => {
        const read = (
          globalThis as typeof globalThis & {
            __OVERGOAL_E2E_DRIBBLE_READ__?: () => {
              elapsed: number;
              trace: Array<{ at_second: number; lane: string }>;
            };
          }
        ).__OVERGOAL_E2E_DRIBBLE_READ__;
        return read?.() ?? null;
      });
      return state;
    })
    .not.toBeNull();
  return state!;
}

test("renders every authoritative outcome and returns to the Timeline", async ({
  context,
  page,
}) => {
  // One matrix case deliberately exercises eight complete authoritative
  // result/continuation flows without duplicating browser setup per outcome.
  test.slow();
  test.setTimeout(330_000);
  const requests: unknown[] = [];
  let authoritativeOutcome: DribbleOutcomeCase = DRIBBLE_OUTCOMES[0];
  let authoritativeActionId = "action-dribble-case-0";
  let authoritativeRevision = 0;
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    requests.push(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        validMatchResponse(
          committedDribble(
            authoritativeOutcome,
            authoritativeActionId,
            request.match_decision,
            authoritativeRevision,
          ),
        ),
      ),
    });
  });
  await enableDebugResultContinuation(page);
  await authenticateForContinuation(page);

  for (const [index, outcome] of DRIBBLE_OUTCOMES.entries()) {
    await test.step(outcome.outcomeType, async () => {
      const actionId = `action-dribble-case-${index}`;
      authoritativeOutcome = outcome;
      authoritativeActionId = actionId;
      authoritativeRevision = index * 2;
      await hydrateDribble(page, dribbleResponse(actionId, index * 2));

      if (outcome.choice === "SIMULATE_FOUL") {
        const simulate = page.getByTestId("dribble-simulate-foul");
        await expect(simulate).toBeDisabled();
        await advanceDribble(page, 2.97);
        await expect(simulate).toBeEnabled();
        await simulate.evaluate((button) => {
          (button as HTMLButtonElement).click();
          (button as HTMLButtonElement).click();
        });
      } else {
        await advanceDribble(page, 8);
      }

      const result = page.getByTestId("kick-result");
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute(
        "data-outcome-type",
        outcome.outcomeType,
      );
      await expect(
        result.getByText(`Authoritative ${outcome.outcomeType} result.`),
      ).toBeVisible();
      expect(requests).toHaveLength(index + 1);
      expect(requests[index]).toMatchObject({
        match_decision: { choice: outcome.choice },
      });
      const submittedDecision = (requests[index] as { match_decision: unknown })
        .match_decision;
      expect(JSON.stringify(submittedDecision)).not.toMatch(
        /seed|quality|outcome/u,
      );

      const nextAction = result.getByRole("button", { name: "Next Action" });
      await expect(nextAction).toBeVisible();
      await expect(nextAction).toBeEnabled();
      if (test.info().project.name === "mobile-chromium") {
        await nextAction.tap();
      } else {
        await nextAction.focus();
        await expect(nextAction).toBeFocused();
        await page.keyboard.press(index % 2 === 0 ? "Enter" : "Space");
      }
      await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
    });
  }
});

test("accepts left and right screen-side taps and submits once", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  test.setTimeout(180_000);
  await enableDebugResultContinuation(page);
  const requests: unknown[] = [];
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    requests.push(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        validMatchResponse(
          committedDribble(
            DRIBBLE_OUTCOMES[0],
            "action-dribble-screen-taps",
            request.match_decision,
          ),
        ),
      ),
    });
  });
  await authenticateForContinuation(page);
  await page.bringToFront();
  await hydrateDribble(page, dribbleResponse("action-dribble-screen-taps"));
  const centerLane = page.getByTestId("dribble-lane-center");
  const rightLane = page.getByTestId("dribble-lane-right");
  await advanceDribble(page, 1);
  await expect(centerLane).toBeEnabled();
  await tapDribbleScreenSide(
    page,
    "left",
    testInfo.project.name === "mobile-chromium",
  );
  await expect
    .poll(async () => (await readDribbleState(page)).trace.at(-1)?.lane)
    .toBe("CENTER");
  const centerTrace = (await readDribbleState(page)).trace;
  await advanceDribble(page, centerTrace.at(-1)!.at_second + 1);
  await expect(rightLane).toBeEnabled();
  await tapDribbleScreenSide(
    page,
    "right",
    testInfo.project.name === "mobile-chromium",
  );
  await expect
    .poll(async () => (await readDribbleState(page)).trace.at(-1)?.lane)
    .toBe("RIGHT");
  const observedTrace = (await readDribbleState(page)).trace;
  expect(observedTrace).not.toBeNull();
  expect(observedTrace.map(({ lane }) => lane)).toEqual([
    "RIGHT",
    "CENTER",
    "RIGHT",
  ]);
  expect(observedTrace[0]).toEqual({ at_second: 0, lane: "RIGHT" });
  expect(observedTrace[1]).toEqual({ at_second: 1, lane: "CENTER" });
  expect(observedTrace[2]).toEqual({ at_second: 2, lane: "RIGHT" });
  const legendLabel = page.getByTestId("legend-player-label");
  await expect(legendLabel).toHaveCount(1);
  await expect(legendLabel).toBeHidden();

  await advanceDribble(page, 8);
  await expect.poll(() => requests.length).toBe(1);
  await page.waitForTimeout(300);

  const result = page.getByTestId("kick-result");
  await expect(result).toBeVisible();
  await expect(legendLabel).toBeHidden();
  expect(requests).toHaveLength(1);
  expect((requests[0] as { match_decision: unknown }).match_decision).toEqual({
    choice: "DRIBBLE_RUN",
    lane_trace: observedTrace,
  });
  await expect(page).toHaveScreenshot(
    `dribble-run-${testInfo.project.name}.png`,
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.0005,
    },
  );
  const nextAction = result.getByRole("button", { name: "Next Action" });
  await expect(nextAction).toBeVisible();
  await nextAction.click();
  await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);

  // Keep this second action paused so visual baselines can compare two stable
  // active frames without the eight-second result replacing the HUD.
  await hydrateDribble(
    page,
    dribbleResponse("action-dribble-visual-evidence", 2),
  );
  await advanceDribble(page, 1);
  const visualCenterLane = page.getByTestId("dribble-lane-center");
  await tapDribbleScreenSide(
    page,
    "left",
    testInfo.project.name === "mobile-chromium",
  );
  await expect(visualCenterLane).toHaveAttribute("aria-checked", "true");
  await advanceDribble(page, 2);
  const beforeSideTapGeometry = await dribblePlayerHudGeometry(page);
  expectDribblePlayersClearOfHud(beforeSideTapGeometry);
  await expect(page).toHaveScreenshot("dribble-active-before-swipe.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.0005,
  });
  await tapDribbleScreenSide(
    page,
    "left",
    testInfo.project.name === "mobile-chromium",
  );
  await expect(page.getByTestId("dribble-lane-left")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const outerLaneTrace = await page
    .getByTestId("dribble-controls")
    .getAttribute("data-lane-trace");
  await advanceDribble(page, 2.97);
  await tapDribbleScreenSide(
    page,
    "left",
    testInfo.project.name === "mobile-chromium",
  );
  await expect(page.getByTestId("dribble-controls")).toHaveAttribute(
    "data-lane-trace",
    outerLaneTrace!,
  );
  const afterSideTapGeometry = await dribblePlayerHudGeometry(page);
  expectDribblePlayersClearOfHud(afterSideTapGeometry);
  expect(
    Math.abs(
      afterSideTapGeometry.legend.top - beforeSideTapGeometry.legend.top,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(legendLabel).toBeHidden();
  expect(
    await page.evaluate(() => {
      const hud = document.querySelector<HTMLElement>(
        '[data-testid="dribble-controls"]',
      );
      if (!hud) throw new Error("Dribble HUD is unavailable");
      const hudBounds = hud.getBoundingClientRect();
      return [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="legend-player-label"]',
        ),
      ].some((label) => {
        const style = getComputedStyle(label);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          label.getClientRects().length === 0
        ) {
          return false;
        }
        const labelBounds = label.getBoundingClientRect();
        return !(
          labelBounds.right <= hudBounds.left ||
          labelBounds.left >= hudBounds.right ||
          labelBounds.bottom <= hudBounds.top ||
          labelBounds.top >= hudBounds.bottom
        );
      });
    }),
  ).toBe(false);
  await expect(page).toHaveScreenshot("dribble-active.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.0005,
  });
  expect(requests).toHaveLength(1);
});

test("submits once after the real eight-second dribble deadline", async ({
  context,
  page,
}) => {
  test.slow();
  const requests: unknown[] = [];
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (new URL(url, location.href).pathname === "/api/processMatchAction") {
        document.documentElement.dataset.dribbleRequestTimerStart =
          document.querySelector<HTMLElement>(
            '[data-testid="dribble-controls"]',
          )?.dataset.runStartedAtMs ?? "";
        document.documentElement.dataset.dribbleRequestPerformanceNow = String(
          performance.now(),
        );
      }
      return originalFetch.call(this, input, init);
    };
  });
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    requests.push(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        committedDribble(
          DRIBBLE_OUTCOMES[0],
          "action-dribble-real-timer",
          request.match_decision,
        ),
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.bringToFront();
  await hydrateDribble(page, dribbleResponse("action-dribble-real-timer"));
  const timerStartedAt = Number(
    await page
      .getByTestId("dribble-controls")
      .getAttribute("data-run-started-at-ms"),
  );
  expect(timerStartedAt).toBeGreaterThan(0);
  await page.evaluate((startedAt) => {
    window.setTimeout(
      () => {
        const requestedAt = Number(
          document.documentElement.dataset.dribbleRequestPerformanceNow,
        );
        document.documentElement.dataset.dribbleRequestObservedBeforeSeven =
          Number.isFinite(requestedAt) && requestedAt < startedAt + 7_000
            ? "true"
            : "false";
      },
      Math.max(0, startedAt + 7_000 - performance.now()),
    );
  }, timerStartedAt);
  await page.waitForFunction(
    (startedAt) => performance.now() >= startedAt + 7_500,
    timerStartedAt,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-dribble-request-observed-before-seven",
    "false",
  );
  await expect.poll(() => requests.length, { timeout: 5_000 }).toBe(1);

  expect(
    Number(
      await page
        .locator("html")
        .getAttribute("data-dribble-request-timer-start"),
    ),
  ).toBe(timerStartedAt);
  const requestPerformanceNow = Number(
    await page
      .locator("html")
      .getAttribute("data-dribble-request-performance-now"),
  );
  const elapsedAtRequest = requestPerformanceNow - timerStartedAt;
  expect(elapsedAtRequest).toBeGreaterThanOrEqual(7_900);
  expect(elapsedAtRequest).toBeLessThanOrEqual(10_000);
  expect(requests).toHaveLength(1);
  expect((requests[0] as { match_decision: unknown }).match_decision).toEqual({
    choice: "DRIBBLE_RUN",
    lane_trace: [{ at_second: 0, lane: "RIGHT" }],
  });
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(1);
});

test("fails visibly without interaction for a malformed future dribble pattern", async ({
  page,
}) => {
  const malformed = dribbleResponse();
  malformed.pending_action.field_state.dribble_pattern = {
    ...malformed.pending_action.field_state.dribble_pattern,
    version: 2,
  };
  malformed.field_state = malformed.pending_action.field_state;
  malformed.match.pending_action = malformed.pending_action;

  await authenticateForContinuation(page);
  await page.evaluate(
    ({ response, myTeam, opponentTeam }) => {
      const setMatchResponse = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
            matchResponse: unknown,
            team: unknown,
            opponent: unknown,
          ) => void;
        }
      ).__OVERGOAL_E2E_SET_MATCH_RESPONSE__;
      if (!setMatchResponse) throw new Error("E2E bridge unavailable");
      setMatchResponse(response, myTeam, opponentTeam);
    },
    { response: malformed, ...teams },
  );
  await expect(page.getByRole("alert")).toContainText(
    "unsupported dribble controls",
  );
  await expect(page.getByTestId("dribble-controls")).toHaveCount(0);
});
