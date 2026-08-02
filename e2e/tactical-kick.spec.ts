import { expect, test, type Page } from "@playwright/test";

import waitingOpenPlayResponse from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };

const controlEnvelope = {
  version: 1,
  input_mapping_version: "kick-v1",
  minimum_power: 0.2,
  maximum_power: 1,
  maximum_curve: 1,
  maximum_lift: 1,
  contact_radius: 1,
};

const teams = {
  myTeam: {
    id: "team_1",
    name: "Dojo United",
    offense: 75,
    defense: 72,
    intensity: 74,
  },
  opponentTeam: {
    id: "team_2",
    name: "Cartridge City",
    offense: 73,
    defense: 71,
    intensity: 70,
  },
};

function canonicalScene(sceneType: "OPEN_PLAY" | "FREE_KICK" | "CORNER" | "PENALTY") {
  const response = structuredClone(waitingOpenPlayResponse);
  const pendingActions = [response.pending_action, response.match.pending_action];
  pendingActions.forEach((action) => {
    Object.assign(action, {
      action_type: sceneType,
      scene_type: sceneType,
      title: sceneType.replaceAll("_", " "),
      control_envelope: controlEnvelope,
    });
  });
  response.field_state.action_type = sceneType;
  response.field_state.scene_family = sceneType;
  response.pending_action.field_state.action_type = sceneType;
  response.pending_action.field_state.scene_family = sceneType;
  return response;
}

async function hydrateScene(page: Page, response: unknown) {
  await page.evaluate(
    ({ matchResponse, myTeam, opponentTeam }) => {
      const setMatchResponse = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
            response: unknown,
            myTeam: unknown,
            opponentTeam: unknown,
          ) => void;
        }
      ).__OVERGOAL_E2E_SET_MATCH_RESPONSE__;
      if (!setMatchResponse) {
        throw new Error("Match session browser-test bridge is unavailable");
      }
      setMatchResponse(matchResponse, myTeam, opponentTeam);
    },
    { matchResponse: response, ...teams },
  );
}

test("renders each canonical tactical scene with preloaded field assets", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );

  for (const sceneType of [
    "OPEN_PLAY",
    "FREE_KICK",
    "CORNER",
    "PENALTY",
  ] as const) {
    await hydrateScene(page, canonicalScene(sceneType));
    await expect(page.getByText(sceneType.replaceAll("_", " "))).toBeVisible();
    await expect(page.getByTestId("game-field").locator("canvas")).toBeVisible();
    await testInfo.attach(`tactical-${sceneType.toLowerCase()}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  }
});
