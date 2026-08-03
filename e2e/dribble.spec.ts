import { expect, type Page, test } from "@playwright/test";

import dribbleScene from "../tests/fixtures/match-api-v1/scenes/dribble.json" with { type: "json" };
import waitingOpenPlay from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";

const FIELD_READY_TIMEOUT_MS = 45_000;
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

function dribbleResponse(actionId = "action-dribble-1") {
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
      current_time: pendingAction.minute,
      prev_time: pendingAction.minute - 1,
      match_status: "WAITING_FOR_DECISION",
      pending_action: pendingAction,
    },
  };
}

function resolvedDribble(outcome: DribbleOutcomeCase, actionId: string) {
  const response = dribbleResponse(actionId);
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

async function hydrateDribble(
  page: Page,
  response: ReturnType<typeof dribbleResponse> = dribbleResponse(),
) {
  const currentPath = new URL(page.url()).pathname;
  if (/^\/match\/[^/]+$/u.test(currentPath)) {
    await page.goBack();
    await expect(page).toHaveURL(/\/game$/u);
  } else if (currentPath !== "/game") {
    await page.goto("/game");
  }
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
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-render-ready",
    "true",
    { timeout: FIELD_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("dribble-controls")).toBeVisible();
}

async function swipeDribbleControls(page: Page, mobile: boolean) {
  const controls = page.getByRole("radiogroup", { name: "Dribble lane" });
  const box = await controls.boundingBox();
  if (!box) throw new Error("Dribble lane controls are not measurable.");
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  const end = { x: box.x + box.width * 0.82, y: start.y };

  if (mobile) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [start],
      });
      for (const progress of [0.33, 0.66, 1]) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: start.x + (end.x - start.x) * progress,
              y: start.y,
            },
          ],
        });
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } finally {
      await session.detach();
    }
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
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
  await page.evaluate((nextSecond) => {
    const advance = (
      globalThis as typeof globalThis & {
        __OVERGOAL_E2E_DRIBBLE_ADVANCE__?: (value: number) => void;
      }
    ).__OVERGOAL_E2E_DRIBBLE_ADVANCE__;
    if (!advance) throw new Error("Dribble E2E bridge unavailable");
    advance(nextSecond);
  }, second);
}

test("renders every authoritative outcome and returns to the Timeline", async ({
  context,
  page,
}) => {
  // One matrix case deliberately exercises eight complete authoritative
  // result/continuation flows while preserving the fixed 49-test gate.
  test.slow();
  test.setTimeout(240_000);
  const requests: unknown[] = [];
  let authoritativeResponse = resolvedDribble(
    DRIBBLE_OUTCOMES[0],
    "action-dribble-case-0",
  );
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(authoritativeResponse),
    });
  });
  await authenticateForContinuation(page);

  for (const [index, outcome] of DRIBBLE_OUTCOMES.entries()) {
    await test.step(outcome.outcomeType, async () => {
      const actionId = `action-dribble-case-${index}`;
      authoritativeResponse = resolvedDribble(outcome, actionId);
      await hydrateDribble(page, dribbleResponse(actionId));

      const controls = page.getByTestId("dribble-controls");
      if (index === 0) {
        await controls.getByRole("radiogroup").focus();
        await advanceDribble(page, 1);
        await page.keyboard.press("ArrowLeft");
        await expect(page.getByTestId("dribble-lane-center")).toHaveAttribute(
          "aria-checked",
          "true",
        );
      }

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
      await nextAction.click();
      await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
    });
  }
});

test("accepts tap and real pointer swipe and submits once on the real eight-second timer", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  const requests: unknown[] = [];
  const requestTimes: number[] = [];
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    requestTimes.push(Date.now());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        resolvedDribble(DRIBBLE_OUTCOMES[0], "action-dribble-real-timer"),
      ),
    });
  });
  await authenticateForContinuation(page);
  await hydrateDribble(page);
  await advanceDribble(page, 1);
  const centerLane = page.getByTestId("dribble-lane-center");
  await expect(centerLane).toBeEnabled();
  if (testInfo.project.name === "mobile-chromium") {
    await centerLane.tap();
  } else {
    await centerLane.click();
  }
  await expect(centerLane).toHaveAttribute("aria-checked", "true");
  await advanceDribble(page, 2);
  const beforeSwipeGeometry = await dribblePlayerHudGeometry(page);
  expectDribblePlayersClearOfHud(beforeSwipeGeometry);
  await expect(page).toHaveScreenshot("dribble-active-before-swipe.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.0005,
  });
  await swipeDribbleControls(page, testInfo.project.name === "mobile-chromium");
  await expect(page.getByTestId("dribble-lane-right")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const afterSwipeGeometry = await dribblePlayerHudGeometry(page);
  expectDribblePlayersClearOfHud(afterSwipeGeometry);
  expect(
    Math.abs(afterSwipeGeometry.legend.top - beforeSwipeGeometry.legend.top),
  ).toBeLessThanOrEqual(1);
  await advanceDribble(page, 2.97);
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  const legendLabel = page.getByTestId("legend-player-label");
  await expect(legendLabel).toHaveCount(1);
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

  await page.bringToFront();
  const realTimerStartedAt = Date.now();
  await hydrateDribble(page, dribbleResponse("action-dribble-real-timer"));
  const countdown = page.getByTestId("dribble-controls").locator("output");
  await expect(countdown).toHaveAttribute(
    "aria-label",
    /7\.[0-9] seconds remaining/u,
    { timeout: 2_000 },
  );
  await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
  const realTimerElapsed = requestTimes[0] - realTimerStartedAt;
  expect(realTimerElapsed).toBeGreaterThanOrEqual(7_500);
  expect(realTimerElapsed).toBeLessThanOrEqual(10_000);
  await page.waitForTimeout(300);

  const result = page.getByTestId("kick-result");
  await expect(result).toBeVisible();
  await expect(legendLabel).toBeHidden();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    match_decision: {
      choice: "DRIBBLE_RUN",
      lane_trace: [{ at_second: 0, lane: "RIGHT" }],
    },
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

  await page.goto("/game");
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
