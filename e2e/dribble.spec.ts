import { expect, type Page, test } from "@playwright/test";

import dribbleScene from "../tests/fixtures/match-api-v1/scenes/dribble.json" with { type: "json" };
import waitingOpenPlay from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };

const FIELD_READY_TIMEOUT_MS = 45_000;
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

function dribbleResponse() {
  const response = structuredClone(waitingOpenPlay);
  const pendingAction = structuredClone(dribbleScene);
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

function resolvedDribble(outcomeType = "DRIBBLE_SURVIVAL") {
  const response = dribbleResponse();
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
        description: `Authoritative ${outcomeType} result.`,
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
      description: `Authoritative ${outcomeType} result.`,
      success: outcomeType === "DRIBBLE_SURVIVAL",
      outcome_type: outcomeType,
    },
  };
}

async function hydrateDribble(page: Page) {
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
    { response: dribbleResponse(), ...teams },
  );
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-render-ready",
    "true",
    { timeout: FIELD_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("dribble-controls")).toBeVisible();
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

test("uses accessible lane controls and submits one server-gated simulation", async ({
  context,
  page,
}) => {
  const requests: unknown[] = [];
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(resolvedDribble("SIMULATION_FREE_KICK")),
    });
  });
  await hydrateDribble(page);

  const controls = page.getByTestId("dribble-controls");
  await controls.getByRole("radiogroup").focus();
  await advanceDribble(page, 1);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("dribble-lane-center")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await advanceDribble(page, 2);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("dribble-lane-right")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await advanceDribble(page, 2.97);
  const simulate = page.getByTestId("dribble-simulate-foul");
  await expect(simulate).toBeEnabled();
  await simulate.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByTestId("kick-result")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    match_decision: {
      choice: "SIMULATE_FOUL",
      lane_trace: [
        { at_second: 0, lane: "RIGHT" },
        { at_second: 1, lane: "CENTER" },
        { at_second: 2, lane: "RIGHT" },
      ],
      simulate_at_second: 2.97,
    },
  });
  expect(JSON.stringify(requests[0])).not.toMatch(/seed|quality|outcome/u);
});

test("accepts touch lane input and automatically submits the canonical run at eight seconds", async ({
  context,
  page,
}, testInfo) => {
  const requests: unknown[] = [];
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(resolvedDribble("DRIBBLE_SURVIVAL")),
    });
  });
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
  await advanceDribble(page, 8);

  await expect(page.getByTestId("kick-result")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    match_decision: {
      choice: "DRIBBLE_RUN",
      lane_trace: [
        { at_second: 0, lane: "RIGHT" },
        { at_second: 1, lane: "CENTER" },
      ],
    },
  });
  await expect(page).toHaveScreenshot(
    `dribble-run-${testInfo.project.name}.png`,
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.002,
    },
  );
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
