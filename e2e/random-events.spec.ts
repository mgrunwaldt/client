import { expect, type Page, test } from "@playwright/test";

import argumentOpponent from "../tests/fixtures/match-api-v1/scenes/argument-opponent.json" with { type: "json" };
import argumentTeammate from "../tests/fixtures/match-api-v1/scenes/argument-teammate.json" with { type: "json" };
import bathroom from "../tests/fixtures/match-api-v1/scenes/bathroom.json" with { type: "json" };
import brawl from "../tests/fixtures/match-api-v1/scenes/brawl.json" with { type: "json" };
import jumper from "../tests/fixtures/match-api-v1/scenes/jumper.json" with { type: "json" };
import matchSnapshot from "../tests/fixtures/match-api-v1/server/match-snapshot-response.json" with { type: "json" };
import waitingOpenPlay from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };
import {
  authenticateForContinuation,
  authenticateToHome,
} from "./support/auth";
import { enableDebugResultContinuation } from "./support/result-continuation";

const FIELD_READY_TIMEOUT_MS = 45_000;
const randomScenes = [
  argumentOpponent,
  argumentTeammate,
  bathroom,
  brawl,
  jumper,
] as const;

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

function randomEventResponse(
  scene: (typeof randomScenes)[number],
  actionId: string,
) {
  const response = structuredClone(waitingOpenPlay);
  const pendingAction = structuredClone(scene);
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
        action: pendingAction.action_type,
        team: pendingAction.action_team,
        minute: pendingAction.minute,
        description: pendingAction.description,
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

function resolvedRandomEvent(
  scene: (typeof randomScenes)[number],
  actionId: string,
  choice: string,
) {
  const response = randomEventResponse(scene, actionId);
  const minute = response.minute + 1;
  const settlement = {
    version: 1,
    id: `settlement-${actionId}`,
    match_id: response.match.id,
    category: "SOCIAL",
    type: "FAN_REPUTATION",
    source: {
      match_id: response.match.id,
      action_id: actionId,
      action_sequence: 4,
      settlement_sequence: 1,
      scene_type: scene.scene_type,
      choice,
    },
    payload: { crowd_reputation: -2 },
    created_revision: response.match.revision + 1,
    created_time: { match_minute: minute, decision_sequence: 4 },
    status: "PENDING",
  } as const;
  const description = `Authoritative ${scene.scene_type} ${choice} result.`;

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
        description,
      },
    ],
    pending_settlement_events: [settlement],
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
      description,
      success: choice !== "HEADBUTT",
      outcome_type: `${scene.scene_type}_${choice}`,
      immediate_effects: {
        energy_delta: -4,
        yellow_cards: choice === "HEADBUTT" ? 1 : 0,
      },
      yellow_card: choice === "HEADBUTT",
      pending_settlement_events: [settlement],
    },
  };
}

function recoveredResponse() {
  const response = structuredClone(waitingOpenPlay);
  const minute = response.minute + 1;
  const description = "Unsupported event skipped without applying effects.";
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
        action: "UNSUPPORTED_SCENE_SKIPPED",
        minute,
        description,
      },
    ],
    pending_settlement_events: [],
    unsupported_scene: null,
    match: {
      ...response.match,
      current_time: minute,
      prev_time: response.minute,
      revision: response.match.revision + 1,
      match_status: "IN_PROGRESS",
      pending_action: null,
    },
  };
}

function unsupportedSceneResponse(actionId: string) {
  const response = randomEventResponse(jumper, actionId);
  const sceneType = "FUTURE_RANDOM_EVENT_V99";
  return {
    ...response,
    status: "WAITING_FOR_RECOVERY",
    pending_action: null,
    field_state: null,
    action: null,
    action_team: null,
    unsupported_scene: {
      version: 1,
      status: "RECOVERY_REQUIRED",
      code: "UNSUPPORTED_SCENE_TYPE",
      scene_type: sceneType,
      action_id: actionId,
      action_sequence: 4,
      minute: response.minute,
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
    },
    match: {
      ...response.match,
      match_status: "WAITING_FOR_RECOVERY",
      pending_action: null,
    },
  };
}

async function hydrateScene(
  page: Page,
  response: unknown,
  options: { waitForField?: boolean } = {},
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
    ({ matchResponse, myTeam, opponentTeam }) => {
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
      bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__(
        matchResponse,
        myTeam,
        opponentTeam,
      );
      bridge.__OVERGOAL_E2E_ADVANCE_TO_SCENE__(
        (matchResponse as { minute: number }).minute,
      );
    },
    { matchResponse: response, ...teams },
  );
  if (options.waitForField !== false) {
    await expect(page.getByTestId("game-field")).toHaveAttribute(
      "data-render-ready",
      "true",
      { timeout: FIELD_READY_TIMEOUT_MS },
    );
    await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  }
}

test("renders all five random scenes and submits each authoritative choice exactly once", async ({
  context,
  page,
}) => {
  test.slow();
  // This is a deliberately complete authenticated matrix: five server scenes
  // times three choices, each returning through the real continuation route.
  test.setTimeout(240_000);
  const requests: unknown[] = [];
  let result = resolvedRandomEvent(jumper, "action-jumper-0", "ACCEPT_HUG");
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(result),
    });
  });
  await enableDebugResultContinuation(page);
  await authenticateForContinuation(page);

  let index = 0;
  for (const scene of randomScenes) {
    for (const choice of scene.available_choices) {
      const actionId = `action-${scene.scene_type.toLowerCase()}-${index}`;
      result = resolvedRandomEvent(scene, actionId, choice.id);
      await hydrateScene(page, randomEventResponse(scene, actionId));

      const event = page.getByTestId("random-event-scene");
      await expect(event).toHaveAttribute("data-scene-type", scene.scene_type);
      await expect(event.getByRole("heading")).toHaveText(scene.title);
      await expect(
        event.getByText(scene.description, { exact: true }),
      ).toBeVisible();
      const choiceButton = page.getByTestId(`random-event-choice-${choice.id}`);
      await expect(choiceButton).toContainText(choice.label);
      await expect(choiceButton).toContainText(choice.description);

      if (test.info().project.name === "mobile-chromium") {
        await choiceButton.tap();
      } else {
        await choiceButton.focus();
        await expect(choiceButton).toBeFocused();
        await page.keyboard.press("Enter");
      }

      const resultPanel = page.getByTestId("kick-result");
      await expect(resultPanel).toContainText(
        `Authoritative ${scene.scene_type} ${choice.id} result.`,
      );
      await expect(
        resultPanel.getByTestId("random-event-result-details"),
      ).toContainText("Energy");
      await expect(
        resultPanel.getByTestId("random-event-result-details"),
      ).toContainText("SOCIAL · FAN REPUTATION");
      expect(requests).toHaveLength(index + 1);
      expect(requests[index]).toMatchObject({
        action_id: actionId,
        match_decision: { choice: choice.id },
      });
      expect(
        (requests[index] as { match_decision: unknown }).match_decision,
      ).toEqual({ choice: choice.id });

      const nextAction = resultPanel.getByTestId("next-action");
      await nextAction.click();
      await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
      index += 1;
    }
  }
  expect(index).toBe(15);
});

test("uses the full-color V1 mobile and desktop event treatment", async ({
  page,
}) => {
  test.slow();
  await authenticateForContinuation(page);
  await hydrateScene(page, randomEventResponse(jumper, "action-jumper-visual"));
  await expect(page.getByTestId("random-event-scene")).toHaveScreenshot(
    "random-event-v1.png",
    { animations: "disabled" },
  );
});

test("submits a valid future fourth choice and auto-continues in production mode", async ({
  context,
  page,
}) => {
  test.slow();
  const requests: unknown[] = [];
  const actionId = "action-jumper-future-choice";
  const futureChoice = {
    id: "CALL_TEAMMATES",
    label: "Call Teammates",
    description: "Ask nearby teammates to help with the interruption.",
    input_schema: {
      required: ["choice"],
      allowed: ["choice"],
      additional_properties: false,
    },
  };
  const scene = structuredClone(jumper);
  scene.available_choices.push(futureChoice);
  const result = resolvedRandomEvent(scene, actionId, futureChoice.id);
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(result),
    });
  });
  await authenticateForContinuation(page);
  await hydrateScene(page, randomEventResponse(scene, actionId));

  const choice = page.getByTestId(`random-event-choice-${futureChoice.id}`);
  await expect(choice).toContainText(futureChoice.label);
  await expect(choice).toContainText(futureChoice.description);
  await choice.click();

  const resultPanel = page.getByTestId("kick-result");
  await expect(resultPanel).toContainText(
    `Authoritative JUMPER ${futureChoice.id} result.`,
  );
  await expect(
    resultPanel.getByRole("button", { name: "Tap to continue" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    action_id: actionId,
    match_decision: { choice: futureChoice.id },
  });

  await expect(page).toHaveURL(/\/match\/match-fixture-1$/u, {
    timeout: 5_500,
  });
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  expect(requests).toHaveLength(1);
});

test("keeps a debug result indefinitely until Next Action is activated", async ({
  context,
  page,
}) => {
  test.slow();
  const requests: unknown[] = [];
  const actionId = "action-jumper-debug-hold";
  const result = resolvedRandomEvent(jumper, actionId, "DODGE");
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(result),
    });
  });
  await enableDebugResultContinuation(page);
  await authenticateForContinuation(page);
  await hydrateScene(page, randomEventResponse(jumper, actionId));
  await page.getByTestId("random-event-choice-DODGE").click();

  const resultPanel = page.getByTestId("kick-result");
  await expect(resultPanel).toBeVisible();
  await page.waitForTimeout(3_200);
  await expect(page).toHaveURL(/\/game$/u);
  await expect(resultPanel).toBeVisible();
  expect(requests).toHaveLength(1);

  await resultPanel.getByTestId("next-action").click();
  await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
  expect(requests).toHaveLength(1);
});

test("recovers a hidden unknown scene exactly once and exposes safe malformed-event recovery", async ({
  context,
  page,
}) => {
  test.slow();
  const requests: unknown[] = [];
  await context.route("**/api/processMatchAction", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(recoveredResponse()),
    });
  });
  await authenticateForContinuation(page);

  const unknown = unsupportedSceneResponse("action-future-1");
  await hydrateScene(page, unknown, { waitForField: false });
  await expect(page.getByTestId("unsupported-event-recovery")).toContainText(
    "FUTURE_RANDOM_EVENT_V99",
  );
  await page.getByTestId("unsupported-event-continue").click();
  await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
  const timeline = page.getByTestId("timeline-screen");
  await expect(timeline).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(timeline).toContainText(
    "Unsupported event skipped without applying effects.",
  );
  await expect(page.getByTestId("unsupported-event-recovery")).toHaveCount(0);
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    action_id: "action-future-1",
    match_decision: { choice: "CONTINUE_WITHOUT_EVENT" },
  });

  const malformed = randomEventResponse(jumper, "action-malformed-1");
  malformed.pending_action.available_choices[0].input_schema = {
    required: ["choice"],
    allowed: ["choice", "unsafe"],
    additional_properties: false,
  };
  await hydrateScene(page, malformed);
  await expect(page.getByTestId("scene-contract-error")).toContainText(
    "invalid choice contract",
  );
  const contractError = page.getByTestId("scene-contract-error");
  await expect(
    contractError.getByRole("button", { name: "Refresh" }),
  ).toBeVisible();
  await expect(
    contractError.getByRole("button", { name: "Timeline" }),
  ).toBeVisible();
  await contractError.getByRole("button", { name: "Timeline" }).click();
  await expect(page).toHaveURL(/\/match\/match-fixture-1$/u);
});

test("contains a malformed recovery contract with retry and safe exit", async ({
  context,
  page,
}) => {
  const malformed = structuredClone(matchSnapshot);
  malformed.match.current_time = 53;
  malformed.match.prev_time = 52;
  malformed.match.match_status = "WAITING_FOR_RECOVERY";
  malformed.match.pending_action = null;
  malformed.pending_action = null;
  malformed.field_state = null;
  malformed.unsupported_scene = {
    version: 1,
    status: "RECOVERY_REQUIRED",
    code: "UNSUPPORTED_SCENE_TYPE",
    scene_type: "FUTURE_RANDOM_EVENT_V99",
    action_id: "action-malformed-recovery",
    action_sequence: 4,
    minute: 53,
    recovery: {
      choice: "CONTINUE_WITHOUT_EVENT",
      label: "Continue Without Event",
      description: "Skip unsupported event content safely.",
    },
  } as never;
  let requests = 0;
  await context.route("**/api/match/match-fixture-1", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(malformed),
    });
  });
  await authenticateToHome(page);
  await page.goto("/match/match-fixture-1");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Live match unavailable");
  await expect(alert).toContainText("invalid success response");
  await expect(
    alert.getByRole("button", { name: "Retry match" }),
  ).toBeVisible();
  await expect(
    alert.getByRole("button", { name: "Back to home" }),
  ).toBeVisible();
  expect(requests).toBe(1);

  await alert.getByRole("button", { name: "Retry match" }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/u);
});
