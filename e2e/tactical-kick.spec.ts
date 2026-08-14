import { join } from "node:path";

import {
  expect,
  type Locator,
  type Page,
  test,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";

import { contactForGridIndex } from "../src/app/(game)/kick-contact-grid";
import type { BackendMatchResponse } from "../src/match/api-v1/contract";
import {
  automaticFinishExpectation,
  type AutomaticFinishFixtureOutcome,
  automaticKickResponse,
  automaticKickScene,
  automaticShotExpectation,
  controlledKickResponse,
  controlledKickScene,
  controlledResultExpectation,
} from "../tests/fixtures/tactical-kick-scenes/controlled-result";
import cornerScene from "../tests/fixtures/tactical-kick-scenes/corner.json" with { type: "json" };
import { failedPassFixtures } from "../tests/fixtures/tactical-kick-scenes/failed-pass-results";
import freeKickScene from "../tests/fixtures/tactical-kick-scenes/free-kick.json" with { type: "json" };
import lobAboveResponse from "../tests/fixtures/tactical-kick-scenes/lob-above-response.json" with { type: "json" };
import lobAboveScene from "../tests/fixtures/tactical-kick-scenes/lob-above-scene.json" with { type: "json" };
import lobBelowResponse from "../tests/fixtures/tactical-kick-scenes/lob-below-response.json" with { type: "json" };
import lobBelowScene from "../tests/fixtures/tactical-kick-scenes/lob-below-scene.json" with { type: "json" };
import openPlayScene from "../tests/fixtures/tactical-kick-scenes/open-play.json" with { type: "json" };
import penaltyScene from "../tests/fixtures/tactical-kick-scenes/penalty.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";
import { withCommittedActionReceipt } from "./support/operation-receipt";
import { enableDebugResultContinuation } from "./support/result-continuation";

const FIELD_READY_TIMEOUT_MS = 90_000;
const tacticalScenes = {
  OPEN_PLAY: openPlayScene,
  FREE_KICK: freeKickScene,
  CORNER: cornerScene,
  PENALTY: penaltyScene,
} as const;
type TacticalSceneType = keyof typeof tacticalScenes;
const mobileFieldViewports = [
  { height: 568, width: 320 },
  { height: 667, width: 375 },
  { height: 844, width: 390 },
  { height: 932, width: 430 },
] as const;
const sceneExpectations: Record<
  TacticalSceneType,
  {
    ballPosition: [string, string];
    description: string;
    maximumPower: string;
    penaltyNonparticipantCount?: string;
    playerCount: string;
    playerRoles: string;
    opponentRoles: string;
    title: string;
  }
> = {
  OPEN_PLAY: {
    ballPosition: ["50", "26.67"],
    description: "Your Legend receives the ball in open play.",
    maximumPower: "0.94",
    title: "Open Play",
    playerCount: "22",
    playerRoles:
      "CAM,DM,GK,GK,LAM,LB,LB,LCB,LCB,LCM,LDM,LW,RAM,RB,RB,RCB,RCB,RCM,RDM,RW,ST,ST",
    opponentRoles: "CAM,GK,LAM,LB,LCB,LDM,RAM,RB,RCB,RDM,ST",
  },
  FREE_KICK: {
    ballPosition: ["50", "20.95"],
    description: "Your Legend wins a dangerous free kick.",
    maximumPower: "0.94",
    title: "Free Kick",
    playerCount: "22",
    playerRoles:
      "CAM,DM,GK,GK,LAM,LB,LCB,LCM,LDM,LW,RAM,RB,RCB,RCM,RDM,RW,ST,ST,WALL,WALL,WALL,WALL",
    opponentRoles: "CAM,GK,LAM,LDM,RAM,RDM,ST,WALL,WALL,WALL,WALL",
  },
  CORNER: {
    ballPosition: ["100", "0"],
    description: "Your team has a corner to attack.",
    maximumPower: "0.939",
    title: "Corner",
    playerCount: "22",
    playerRoles:
      "CAM,EDGE_BOX,FAR_POST,GK,GK,LAM,LCM,LDM,LW,MARKER_1,MARKER_2,MARKER_3,MARKER_4,NEAR_POST,PENALTY_SPOT,RAM,RB,RCM,RDM,RW,ST,ST",
    opponentRoles:
      "CAM,GK,LAM,LDM,MARKER_1,MARKER_2,MARKER_3,MARKER_4,RAM,RDM,ST",
  },
  PENALTY: {
    ballPosition: ["50", "10.48"],
    description: "Your Legend steps up for a penalty.",
    maximumPower: "0.94",
    penaltyNonparticipantCount: "20",
    title: "Penalty Kick",
    playerCount: "22",
    playerRoles:
      "CAM,DM,GK,GK,LAM,LB,LB,LCB,LCB,LCM,LDM,LW,RAM,RB,RB,RCB,RCB,RCM,RDM,RW,ST,ST",
    opponentRoles: "CAM,GK,LAM,LB,LCB,LDM,RAM,RB,RCB,RDM,ST",
  },
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

function angularDistance(left: number, right: number) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function canonicalScene(sceneType: TacticalSceneType) {
  return structuredClone(tacticalScenes[sceneType]);
}

function canonicalSceneForMatch(sceneType: TacticalSceneType, matchId: string) {
  const scene = canonicalScene(sceneType);
  return JSON.parse(
    JSON.stringify(scene).replaceAll(scene.match.id, matchId),
  ) as typeof scene;
}

function controlledContinuationForMatch(matchId: string) {
  const response = controlledKickResponse();
  return JSON.parse(
    JSON.stringify(response).replaceAll(response.match.id, matchId),
  ) as BackendMatchResponse;
}

async function hydrateScene(page: Page, response: unknown) {
  const matchId = (response as { match: { id: string } }).match.id;
  const gamePath = `/game/${matchId}`;
  if (new URL(page.url()).pathname !== gamePath) {
    await page.goto(gamePath);
  }
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  const sceneMinute =
    typeof response === "object" && response !== null && "minute" in response
      ? (response as { minute: number }).minute
      : 12;
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
  await page.evaluate((minute) => {
    const advance = (
      globalThis as typeof globalThis & {
        __OVERGOAL_E2E_ADVANCE_TO_SCENE__?: (sceneMinute: number) => void;
      }
    ).__OVERGOAL_E2E_ADVANCE_TO_SCENE__;
    if (!advance)
      throw new Error("Match scene browser-test bridge is unavailable");
    advance(minute);
  }, sceneMinute);
}

async function setSceneResponse(page: Page, response: unknown) {
  await page.evaluate(
    ({ matchResponse, myTeam, opponentTeam }) => {
      const bridge = globalThis as typeof globalThis & {
        __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
          response: unknown,
          myTeam: unknown,
          opponentTeam: unknown,
        ) => void;
      };
      if (!bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__) {
        throw new Error("Match session browser-test bridge is unavailable");
      }
      bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__(
        matchResponse,
        myTeam,
        opponentTeam,
      );
    },
    { matchResponse: response, ...teams },
  );
}

async function routeWithinApp(page: Page, pathname: string) {
  await page.evaluate((nextPathname) => {
    window.history.pushState({}, "", nextPathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
}

async function reverseDragFromBall(
  page: Page,
  target: Locator,
  mobile: boolean,
  pull = { x: -72, y: 54 },
) {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("The live ball aim target is not measurable.");
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const end = { x: start.x + pull.x, y: start.y + pull.y };

  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [end],
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.up();
}

async function controlledResultRenderState(field: Locator) {
  return field.evaluate((element) => {
    const result = document.querySelector<HTMLElement>(
      '[data-testid="kick-result"]',
    );
    const resultCopy = result?.innerText ?? "";
    return {
      resultMinute: element.getAttribute("data-result-minute"),
      continuationMinute: element.getAttribute("data-continuation-minute"),
      receiverId: element.getAttribute("data-result-receiver-id"),
      receiverX: element.getAttribute("data-result-receiver-x"),
      receiverY: element.getAttribute("data-result-receiver-y"),
      controlCarrierId: element.getAttribute("data-result-control-carrier-id"),
      carrierId: element.getAttribute("data-carrier-player-id"),
      carrierX: element.getAttribute("data-carrier-player-x"),
      carrierY: element.getAttribute("data-carrier-player-y"),
      carrierHasBall: element.getAttribute("data-carrier-has-ball"),
      resultFacingX: element.getAttribute("data-result-facing-target-x"),
      resultFacingY: element.getAttribute("data-result-facing-target-y"),
      resultFacingPlayerId: element.getAttribute(
        "data-result-facing-target-player-id",
      ),
      carrierFacingX: element.getAttribute("data-carrier-facing-target-x"),
      carrierFacingY: element.getAttribute("data-carrier-facing-target-y"),
      carrierFacingPlayerId: element.getAttribute(
        "data-carrier-facing-target-player-id",
      ),
      resultCarryOffset: element.getAttribute("data-result-carry-offset-m"),
      carrierCarryOffset: element.getAttribute("data-carrier-carry-offset-m"),
      ballX: element.getAttribute("data-ball-x"),
      ballY: element.getAttribute("data-ball-y"),
      legendPlayerId: document
        .querySelector('[data-testid="legend-player-label"]')
        ?.getAttribute("data-player-id"),
      resultCopy,
      bodyCopy: document.body.textContent ?? "",
    };
  });
}

async function previewAimArrow(
  page: Page,
  target: Locator,
  offset: { x: number; y: number },
  name: string,
  testInfo: TestInfo,
) {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("The live ball aim target is not measurable.");
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The tactical viewport is not measurable.");
  const end = {
    x: Math.max(8, Math.min(start.x + offset.x, viewport.width - 8)),
    y: Math.max(8, Math.min(start.y + offset.y, viewport.height - 8)),
  };

  const mobile = testInfo.project.name === "mobile-chromium";
  const touchSession = mobile ? await page.context().newCDPSession(page) : null;
  if (touchSession) {
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (let step = 1; step <= 6; step += 1) {
      const progress = step / 6;
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          },
        ],
      });
      await page.waitForTimeout(16);
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Let React and R3F paint the same final drag state used for both the
  // attachment and the committed visual baseline.
  await page.waitForTimeout(250);
  const fullViewport = await captureTacticalEvidence(
    page,
    testInfo,
    `kick-arrow-${name}`,
    false,
  );
  if (name === "maximum") {
    expect(fullViewport).toMatchSnapshot(
      "kick-arrow-maximum-full-viewport.png",
      { maxDiffPixelRatio: 0.002 },
    );
  }
  const clipWidth = Math.min(360, viewport.width);
  const clipHeight = Math.min(320, viewport.height);
  const clipX = Math.max(
    0,
    Math.min(start.x - clipWidth / 2, viewport.width - clipWidth),
  );
  const clipY = Math.max(
    0,
    Math.min(start.y - clipHeight / 2, viewport.height - clipHeight),
  );
  const metadata = await sharp(fullViewport).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The tactical screenshot has no measurable dimensions.");
  }
  const scaleX = metadata.width / viewport.width;
  const scaleY = metadata.height / viewport.height;
  const screenshot = await sharp(fullViewport)
    .extract({
      left: Math.round(clipX * scaleX),
      top: Math.round(clipY * scaleY),
      width: Math.round(clipWidth * scaleX),
      height: Math.round(clipHeight * scaleY),
    })
    .png()
    .toBuffer();
  expect(screenshot).toMatchSnapshot(`kick-arrow-${name}.png`, {
    maxDiffPixelRatio: 0.002,
  });
  if (touchSession) {
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touchSession.detach();
  } else {
    await page.mouse.up();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(target).toBeFocused();
}

async function captureTacticalEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
  verifyCanvas = true,
) {
  if (verifyCanvas) await expectTacticalCanvasFillsViewport(page);
  const path = testInfo.outputPath(`${name}.png`);
  const screenshot = await page.screenshot({
    path,
    animations: "disabled",
    caret: "hide",
  });
  const { data, info } = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bandHeight = Math.max(1, Math.floor(info.height / 12));
  let maximumBlankRatio = 0;
  for (let band = 0; band < 12; band += 1) {
    const startY = band * bandHeight;
    const endY = band === 11 ? info.height : startY + bandHeight;
    let blankPixels = 0;
    const pixelCount = (endY - startY) * info.width;
    for (let y = startY; y < endY; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
        if (
          alpha < 250 ||
          (red >= 245 && green >= 245 && blue >= 245) ||
          (red <= 10 && green <= 10 && blue <= 10)
        ) {
          blankPixels += 1;
        }
      }
    }
    maximumBlankRatio = Math.max(maximumBlankRatio, blankPixels / pixelCount);
  }
  expect(
    maximumBlankRatio,
    "every horizontal viewport band must contain a composed field frame",
  ).toBeLessThan(0.1);
  await testInfo.attach(name, { path, contentType: "image/png" });
  return screenshot;
}

async function expectTacticalCanvasFillsViewport(page: Page) {
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-render-ready",
    "true",
  );
  const canvas = page.getByTestId("game-field").locator("canvas");
  await expect
    .poll(
      () =>
        canvas.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const webglCanvas = element as HTMLCanvasElement;
          return {
            fullHeight: Math.abs(bounds.height - window.innerHeight) <= 1,
            fullWidth: Math.abs(bounds.width - window.innerWidth) <= 1,
            hasDrawingBuffer:
              webglCanvas.width >= Math.floor(bounds.width) &&
              webglCanvas.height >= Math.floor(bounds.height),
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      fullHeight: true,
      fullWidth: true,
      hasDrawingBuffer: true,
    });
}

async function waitForRenderableTacticalScene(
  page: Page,
  sceneType: TacticalSceneType,
) {
  const expectation = sceneExpectations[sceneType];
  const field = page.getByTestId("game-field");
  await expect(field).toHaveAttribute("data-render-ready", "true", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(field).toHaveAttribute(
    "data-player-count",
    expectation.playerCount,
  );
  await expect(field).toHaveAttribute("data-scene-family", sceneType);
  await expect(field).toHaveAttribute(
    "data-ball-x",
    expectation.ballPosition[0],
  );
  await expect(field).toHaveAttribute(
    "data-ball-y",
    expectation.ballPosition[1],
  );
  await expect(field).toHaveAttribute(
    "data-player-roles",
    expectation.playerRoles,
  );
  await expect(field).toHaveAttribute(
    "data-opponent-roles",
    expectation.opponentRoles,
  );
  await expect(
    page.getByText(expectation.description, { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible({
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("ball-aim-target")).toHaveAttribute(
    "data-kick-maximum-power",
    expectation.maximumPower,
  );
  // The dribble/result HUD must not suppress the normal field-play marker.
  await expect(page.getByTestId("legend-player-label")).toBeVisible();
  if (expectation.penaltyNonparticipantCount) {
    await expect(field).toHaveAttribute(
      "data-penalty-nonparticipant-count",
      expectation.penaltyNonparticipantCount,
    );
  }
}

function resolvedKickResponse(sceneType: TacticalSceneType = "OPEN_PLAY") {
  const response = canonicalScene(sceneType);
  const actionMinute = response.pending_action.minute;
  const continuationMinute = actionMinute + 1;
  return Object.assign(response, {
    minute: continuationMinute,
    prev_time: actionMinute,
    status: "IN_PROGRESS",
    pending_action: null,
    field_state: null,
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
    match: {
      ...response.match,
      current_time: continuationMinute,
      prev_time: actionMinute,
      revision: response.match.revision + 1,
      match_status: "IN_PROGRESS",
      pending_action: null,
    },
    decision_result: {
      description: "The goalkeeper turns it away.",
      success: false,
      outcome_type: "SAVE",
      flight_outcome: "SAVE",
      flight_path: [
        { x: 72, y: 36.2, z: 0.11, t: 0 },
        { x: 62, y: 18, z: 2.4, t: 0.15 },
        { x: 54, y: 8, z: 0.11, t: 0.3 },
      ],
      final_point: { x: 54, y: 8, z: 0.11, t: 0.3 },
    },
  });
}

function committedKickResponse(
  sceneType: TacticalSceneType,
  decisionData: Record<string, unknown>,
) {
  return withCommittedActionReceipt(
    canonicalScene(sceneType),
    resolvedKickResponse(sceneType),
    { decisionData },
  );
}

test("renders each canonical tactical scene with preloaded field assets", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sceneTypes = ["OPEN_PLAY", "FREE_KICK", "CORNER", "PENALTY"] as const;
  const matrixMatchId = "match-canonical-matrix";
  await authenticateForContinuation(page);
  const canvas = page.getByTestId("game-field").locator("canvas");

  for (const [index, sceneType] of sceneTypes.entries()) {
    await test.step(sceneType, async () => {
      await hydrateScene(
        page,
        canonicalSceneForMatch(sceneType, matrixMatchId),
      );
      await expect(
        page.getByText(sceneExpectations[sceneType].title, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(canvas).toBeVisible();
      if (index === 0) {
        await canvas.evaluate((element) => {
          element.setAttribute("data-canonical-matrix-canvas", "mounted");
        });
      } else {
        await expect(canvas).toHaveAttribute(
          "data-canonical-matrix-canvas",
          "mounted",
        );
      }
      await waitForRenderableTacticalScene(page, sceneType);
      if (sceneType === "FREE_KICK") {
        const ball = page.getByTestId("ball-render-probe");
        const penaltyAreaBottom = page.getByTestId(
          "opponent-penalty-area-bottom-probe",
        );
        await expect(ball).toBeAttached();
        await expect(penaltyAreaBottom).toBeAttached();
        const [ballBox, penaltyAreaBox] = await Promise.all([
          ball.boundingBox(),
          penaltyAreaBottom.boundingBox(),
        ]);
        if (!ballBox || !penaltyAreaBox) {
          throw new Error("Free-kick regulation anchors are not measurable");
        }
        expect(ballBox.y).toBeGreaterThan(penaltyAreaBox.y);
      }
      if (sceneType === "CORNER") {
        const field = page.getByTestId("game-field");
        await expect(field).toHaveAttribute("data-corner-camera", "true");
        const ball = page.getByTestId("ball-render-probe");
        const corner = page.getByTestId("corner-flag-render-probe");
        const [ballBox, cornerBox] = await Promise.all([
          ball.boundingBox(),
          corner.boundingBox(),
        ]);
        if (!ballBox || !cornerBox) {
          throw new Error("Corner regulation anchors are not measurable");
        }
        const ballCenter = {
          x: ballBox.x + ballBox.width / 2,
          y: ballBox.y + ballBox.height / 2,
        };
        const cornerCenter = {
          x: cornerBox.x + cornerBox.width / 2,
          y: cornerBox.y + cornerBox.height / 2,
        };
        expect(
          Math.hypot(
            ballCenter.x - cornerCenter.x,
            ballCenter.y - cornerCenter.y,
          ),
        ).toBeLessThan(2);
        const viewport = page.viewportSize();
        if (!viewport) throw new Error("Corner viewport is unavailable");
        expect(ballCenter.y).toBeLessThan(viewport.height * 0.72);
      }
      const screenshot = await captureTacticalEvidence(
        page,
        testInfo,
        `tactical-${sceneType.toLowerCase()}`,
      );
      expect(screenshot).toMatchSnapshot(
        `tactical-${sceneType.toLowerCase()}.png`,
        { maxDiffPixelRatio: 0.002 },
      );
    });
  }
});

test("keeps every tactical composition readable across supported portrait phones", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "The portrait viewport matrix runs once on the mobile browser project.",
  );
  test.setTimeout(600_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticateForContinuation(page);

  for (const viewport of mobileFieldViewports) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      const matchId = `match-field-framing-${viewport.width}`;
      const frames: Buffer[] = [];
      const scenes = [
        ...(["OPEN_PLAY", "FREE_KICK", "CORNER", "PENALTY"] as const).map(
          (sceneType) => ({
            name: sceneType.toLowerCase().replaceAll("_", "-"),
            response: canonicalSceneForMatch(sceneType, matchId),
            sceneType,
          }),
        ),
        {
          name: "post-pass",
          response: controlledContinuationForMatch(matchId),
          sceneType: "POST_PASS" as const,
        },
      ];

      for (const scene of scenes) {
        await hydrateScene(page, scene.response);
        if (scene.sceneType === "POST_PASS") {
          const field = page.getByTestId("game-field");
          await expect(field).toHaveAttribute("data-render-ready", "true", {
            timeout: FIELD_READY_TIMEOUT_MS,
          });
          await expect(field).toHaveAttribute("data-scene-family", "OPEN_PLAY");
          await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
          await expect(page.getByTestId("ball-aim-target")).toBeVisible();
          await expect(page.getByTestId("legend-player-label")).toBeVisible();
        } else {
          await waitForRenderableTacticalScene(page, scene.sceneType);
        }
        await expectTacticalCanvasFillsViewport(page);

        const [ball, legend, goal, hud] = await Promise.all([
          page.getByTestId("ball-aim-target").boundingBox(),
          page.getByTestId("legend-player-anchor").boundingBox(),
          page.getByTestId("field-camera-anchor").boundingBox(),
          page.getByTestId("field-scene-hud").boundingBox(),
        ]);
        if (!ball || !legend || !goal || !hud) {
          throw new Error(
            `${scene.name} ${viewport.width}x${viewport.height} has an unmeasurable tactical anchor`,
          );
        }
        const centers = [
          { bounds: ball, name: "ball" },
          { bounds: legend, name: "legend" },
          ...(scene.sceneType === "POST_PASS"
            ? []
            : [{ bounds: goal, name: "goal" }]),
        ].map(({ bounds, name }) => ({
          name,
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        }));
        for (const center of centers) {
          expect(
            center.x,
            `${scene.name} ${center.name} must remain inside the field width`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            center.x,
            `${scene.name} ${center.name} must remain inside the field width`,
          ).toBeLessThanOrEqual(viewport.width);
          expect(
            center.y,
            `${scene.name} ${center.name} must remain below the viewport top`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            center.y,
            `${scene.name} ${center.name} must remain above the field HUD`,
          ).toBeLessThan(hud.y - 4);
        }

        frames.push(
          await page.screenshot({
            animations: "disabled",
            caret: "hide",
          }),
        );
      }

      const frameMetadata = await sharp(frames[0]).metadata();
      if (!frameMetadata.width || !frameMetadata.height) {
        throw new Error(
          `${viewport.width}x${viewport.height} evidence is empty`,
        );
      }
      const contactSheet = await sharp({
        create: {
          background: "#020814",
          channels: 4,
          height: frameMetadata.height,
          width: frameMetadata.width * frames.length,
        },
      })
        .composite(
          frames.map((input, index) => ({
            input,
            left: index * frameMetadata.width,
            top: 0,
          })),
        )
        .png()
        .toBuffer();
      const evidenceName = `field-framing-${viewport.width}x${viewport.height}`;
      const evidencePath = testInfo.outputPath(`${evidenceName}.png`);
      await sharp(contactSheet).toFile(evidencePath);
      await testInfo.attach(evidenceName, {
        contentType: "image/png",
        path: evidencePath,
      });
      expect(contactSheet).toMatchSnapshot(`${evidenceName}.png`, {
        maxDiffPixelRatio: 0.002,
      });
    });
  }
});

test("preserves tactical aim context across contact selection on small and large phones", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "The portrait context matrix runs once on the mobile browser project.",
  );
  test.setTimeout(360_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticateForContinuation(page);

  for (const viewport of [
    { height: 568, width: 320 },
    { height: 932, width: 430 },
  ] as const) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      const matchId = `match-contact-context-${viewport.width}`;
      const frames: Buffer[] = [];
      const scenes = [
        {
          name: "fixed",
          response: canonicalSceneForMatch("OPEN_PLAY", matchId),
        },
        {
          name: "corner",
          response: canonicalSceneForMatch("CORNER", matchId),
        },
        {
          name: "follow",
          response: controlledContinuationForMatch(matchId),
        },
      ];

      for (const scene of scenes) {
        await hydrateScene(page, scene.response);
        const field = page.getByTestId("game-field");
        await expect(field).toHaveAttribute("data-render-ready", "true", {
          timeout: FIELD_READY_TIMEOUT_MS,
        });
        await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
        const target = page.getByTestId("ball-aim-target");
        await expect(target).toBeVisible();
        await reverseDragFromBall(page, target, true);

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(field).toHaveAttribute(
          "data-interaction-phase",
          "contact_selection",
        );
        const aimBeforeClose = await field.evaluate((element) => ({
          directionX: element.getAttribute("data-aim-direction-x"),
          directionZ: element.getAttribute("data-aim-direction-z"),
          power: element.getAttribute("data-aim-power"),
        }));
        expect(aimBeforeClose.power).not.toBeNull();

        const [panelBounds, strikeBounds, targetBounds] = await Promise.all([
          page.getByTestId("kick-contact-panel").boundingBox(),
          page.getByTestId("kick-contact-ball").boundingBox(),
          target.boundingBox(),
        ]);
        if (!panelBounds || !strikeBounds || !targetBounds) {
          throw new Error(
            `${scene.name} contact composition is not measurable`,
          );
        }
        expect(panelBounds.y).toBeGreaterThanOrEqual(0);
        expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(
          viewport.height,
        );
        expect(strikeBounds.width).toBeGreaterThanOrEqual(44);

        await page.mouse.click(
          targetBounds.x + targetBounds.width / 2,
          targetBounds.y + targetBounds.height / 2,
        );
        await expect(dialog).toBeVisible();
        expect(
          await field.evaluate((element) => ({
            directionX: element.getAttribute("data-aim-direction-x"),
            directionZ: element.getAttribute("data-aim-direction-z"),
            power: element.getAttribute("data-aim-power"),
          })),
        ).toEqual(aimBeforeClose);

        await page.getByRole("button", { name: "Close" }).click();
        await expect(field).toHaveAttribute("data-interaction-phase", "aiming");
        expect(
          await field.evaluate((element) => ({
            directionX: element.getAttribute("data-aim-direction-x"),
            directionZ: element.getAttribute("data-aim-direction-z"),
            power: element.getAttribute("data-aim-power"),
          })),
        ).toEqual(aimBeforeClose);

        await reverseDragFromBall(page, target, true);
        await expect(dialog).toBeVisible();
        frames.push(
          await page.screenshot({ animations: "disabled", caret: "hide" }),
        );
        await page.getByRole("button", { name: "Close" }).click();
        await expect(dialog).toBeHidden();
      }

      const metadata = await sharp(frames[0]).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("Tactical contact context evidence is empty.");
      }
      const sheet = await sharp({
        create: {
          background: "#020814",
          channels: 4,
          height: metadata.height,
          width: metadata.width * frames.length,
        },
      })
        .composite(
          frames.map((input, index) => ({
            input,
            left: index * metadata.width!,
            top: 0,
          })),
        )
        .png()
        .toBuffer();
      const snapshotName = `kick-context-${viewport.width}x${viewport.height}.png`;
      await testInfo.attach(snapshotName, {
        body: sheet,
        contentType: "image/png",
      });
      expect(sheet).toMatchSnapshot(snapshotName, { maxDiffPixelRatio: 0.002 });
    });
  }
});

test("keeps one field renderer through timeline and returns without a full loader", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticateForContinuation(page);

  const matchId = "match-resident-field";
  const firstScene = canonicalSceneForMatch("OPEN_PLAY", matchId);
  await hydrateScene(page, firstScene);
  await waitForRenderableTacticalScene(page, "OPEN_PLAY");

  const canvas = page.getByTestId("game-field").locator("canvas");
  await canvas.evaluate((element) => {
    element.setAttribute("data-resident-renderer", "original");
  });

  const timeline = structuredClone(
    firstScene,
  ) as unknown as BackendMatchResponse;
  timeline.minute = 23;
  timeline.prev_time = firstScene.minute;
  timeline.status = "IN_PROGRESS";
  timeline.action = "CONTINUE";
  timeline.action_team = null;
  timeline.pending_action = null;
  timeline.field_state = null;
  timeline.match = {
    ...timeline.match,
    current_time: timeline.minute,
    prev_time: timeline.prev_time,
    revision: timeline.match.revision + 1,
    match_status: "IN_PROGRESS",
    pending_action: null,
  };
  await setSceneResponse(page, timeline);
  await routeWithinApp(page, `/match/${matchId}`);
  // This synthetic path enters the field before ever loading the lazy timeline
  // route. Its one-time chunk load is setup, not the measured field return.
  await expect(page.getByTestId("timeline-screen")).toBeVisible({
    timeout: 15_000,
  });
  await expect(canvas).toBeAttached();
  await expect(canvas).toHaveAttribute("data-resident-renderer", "original");

  const secondScene = canonicalSceneForMatch(
    "FREE_KICK",
    matchId,
  ) as unknown as BackendMatchResponse;
  if (!secondScene.pending_action) {
    throw new Error("The second tactical fixture needs a pending action.");
  }
  secondScene.match.revision = timeline.match.revision + 1;

  await setSceneResponse(page, secondScene);
  const startedAt = Date.now();
  await page.evaluate((minute) => {
    const advance = (
      globalThis as typeof globalThis & {
        __OVERGOAL_E2E_ADVANCE_TO_SCENE__?: (sceneMinute: number) => void;
      }
    ).__OVERGOAL_E2E_ADVANCE_TO_SCENE__;
    if (!advance)
      throw new Error("Match scene browser-test bridge is unavailable");
    advance(minute);
  }, secondScene.minute);

  await expect(page).toHaveURL(new RegExp(`/game/${matchId}$`), {
    timeout: 1_500,
  });
  expect(Date.now() - startedAt).toBeLessThan(1_000);
  await expect(canvas).toHaveAttribute("data-resident-renderer", "original");
  await waitForRenderableTacticalScene(page, "FREE_KICK");
  await expect(page.getByTestId("match-transition-loader")).toBeHidden();
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
});

test("requires fresh complete frames after resize and orientation change", async ({
  page,
}) => {
  test.slow();
  await authenticateForContinuation(page);
  await hydrateScene(page, canonicalScene("OPEN_PLAY"));
  await waitForRenderableTacticalScene(page, "OPEN_PLAY");
  const field = page.getByTestId("game-field");

  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="game-field"]');
    if (!target) throw new Error("Field readiness target is unavailable");
    document.body.dataset.readinessHistory =
      target.getAttribute("data-render-ready") ?? "";
    new MutationObserver(() => {
      document.body.dataset.readinessHistory += `,${target.getAttribute("data-render-ready")}`;
    }).observe(target, {
      attributeFilter: ["data-render-ready"],
      attributes: true,
    });
  });

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Tactical viewport is unavailable");
  await page.setViewportSize({
    width: viewport.height,
    height: viewport.width,
  });
  await expect
    .poll(() => page.locator("body").getAttribute("data-readiness-history"))
    .toContain("false");
  await expect(field).toHaveAttribute("data-render-ready", "true", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible();
});

test("fails safely before interaction for an unsupported kick envelope", async ({
  page,
}) => {
  test.slow();
  await authenticateForContinuation(page);
  const unsupported = canonicalScene("OPEN_PLAY");
  Object.assign(unsupported.pending_action.control_envelope, {
    selection_quality: 0.9,
  });
  await hydrateScene(page, unsupported);

  const field = page.getByTestId("game-field");
  await expect(field).toHaveAttribute("data-render-ready", "true", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(field).toHaveAttribute("data-kick-contract-supported", "false");
  await expect(page.getByTestId("ball-aim-target")).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "unsupported kick controls" }),
  ).toBeVisible();
});

test("keeps keyboard focus inside the contact dialog and restores the aim target", async ({
  page,
}, testInfo) => {
  test.slow();
  await authenticateForContinuation(page);
  await hydrateScene(page, canonicalScene("OPEN_PLAY"));
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );

  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("gridcell", { selected: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("gridcell", { name: "Center left contact", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText(/^Center left contact\. Full power\./u),
  ).toBeAttached();

  const submit = page.getByTestId("kick-submit");
  await submit.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(target).toBeFocused();

  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(target).toBeFocused();
});

test("presents contact, flight, bend, and power as a mobile game interaction", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "One portrait evidence sheet is sufficient for this visual interaction.",
  );
  test.slow();
  await authenticateForContinuation(page);
  await hydrateScene(page, canonicalScene("OPEN_PLAY"));

  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await reverseDragFromBall(page, target, true);

  const dialog = page.getByRole("dialog");
  const ball = page.getByTestId("kick-contact-ball");
  const marker = page.getByTestId("kick-contact-marker");
  const frames: Buffer[] = [];
  const capture = async (name: string) => {
    const frame = await dialog.screenshot();
    frames.push(frame);
    await testInfo.attach(`kick-contact-${name}`, {
      body: frame,
      contentType: "image/png",
    });
  };
  const select = async (
    name: string,
    percent: { x: number; y: number },
    expected: { flight: string; curve: string },
  ) => {
    const bounds = await ball.boundingBox();
    if (!bounds) throw new Error("The contact ball is not measurable.");
    await ball.click({
      position: {
        x: bounds.width * percent.x,
        y: bounds.height * percent.y,
      },
    });
    await expect(page.getByTestId("kick-flight-feedback")).toContainText(
      expected.flight,
    );
    await expect(page.getByTestId("kick-curve-feedback")).toContainText(
      expected.curve,
    );
    await capture(name);
  };

  await expect(page.getByTestId("kick-power-feedback")).toContainText(
    "Full power",
  );
  await expect(page.getByTestId("kick-flight-feedback")).toContainText("Level");
  await expect(page.getByTestId("kick-curve-feedback")).toContainText(
    "Straight",
  );
  await expect(dialog).not.toContainText(
    /Submitted power|Server power range|Contact:|payload|contract/u,
  );
  await capture("center-full");

  await select(
    "upper-left",
    { x: 0.18, y: 0.18 },
    {
      flight: "Skimming",
      curve: "Curl right",
    },
  );
  await select(
    "upper-right",
    { x: 0.82, y: 0.18 },
    {
      flight: "Skimming",
      curve: "Curl left",
    },
  );
  await select(
    "lower-left",
    { x: 0.18, y: 0.82 },
    {
      flight: "Lofted",
      curve: "Curl right",
    },
  );
  await select(
    "lower-right",
    { x: 0.82, y: 0.82 },
    {
      flight: "Lofted",
      curve: "Curl left",
    },
  );
  await select(
    "clamped-edge",
    { x: 0.5, y: 0.01 },
    {
      flight: "Skimming",
      curve: "Straight",
    },
  );

  const [ballBounds, markerBounds] = await Promise.all([
    ball.boundingBox(),
    marker.boundingBox(),
  ]);
  expect(ballBounds).not.toBeNull();
  expect(markerBounds).not.toBeNull();
  expect(markerBounds!.x + markerBounds!.width / 2).toBeGreaterThanOrEqual(
    ballBounds!.x,
  );
  expect(markerBounds!.y + markerBounds!.height / 2).toBeGreaterThanOrEqual(
    ballBounds!.y,
  );
  expect(markerBounds!.x + markerBounds!.width / 2).toBeLessThanOrEqual(
    ballBounds!.x + ballBounds!.width,
  );
  expect(markerBounds!.y + markerBounds!.height / 2).toBeLessThanOrEqual(
    ballBounds!.y + ballBounds!.height,
  );

  await page.getByRole("button", { name: "Close" }).click();
  await reverseDragFromBall(page, target, true, { x: -4, y: 3 });
  await expect(page.getByTestId("kick-power-feedback")).toContainText(
    "Soft touch",
  );
  await capture("center-soft");

  const metadata = await sharp(frames[0]).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Contact feedback evidence is empty.");
  }
  const columns = 4;
  const rows = Math.ceil(frames.length / columns);
  const sheet = await sharp({
    create: {
      background: "#020814",
      channels: 4,
      width: metadata.width * columns,
      height: metadata.height * rows,
    },
  })
    .composite(
      frames.map((input, index) => ({
        input,
        left: (index % columns) * metadata.width!,
        top: Math.floor(index / columns) * metadata.height!,
      })),
    )
    .png()
    .toBuffer();
  await testInfo.attach("kick-contact-feedback-mobile", {
    body: sheet,
    contentType: "image/png",
  });
  expect(sheet).toMatchSnapshot("kick-contact-feedback-mobile.png", {
    maxDiffPixelRatio: 0.002,
  });
});

test("submits one canonical reverse-drag kick and plays the authoritative result", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  await enableDebugResultContinuation(page);
  const submittedRequests: unknown[] = [];
  const authoritativeResultMinute =
    canonicalScene("OPEN_PLAY").pending_action.minute;
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    submittedRequests.push(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        committedKickResponse("OPEN_PLAY", request.match_decision),
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await hydrateScene(page, canonicalScene("OPEN_PLAY"));

  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("gridcell", { selected: true })).toBeFocused();
  await expect(
    page.getByRole("gridcell", { name: "Center contact", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("kick-power-feedback")).toContainText(
    "Full power",
  );
  await expect(page.getByTestId("kick-flight-feedback")).toContainText("Level");
  await expect(page.getByTestId("kick-curve-feedback")).toContainText(
    "Straight",
  );
  await expect(dialog).not.toContainText(
    /Submitted power|Server power range|Contact:/u,
  );
  await expect(page.getByTestId("kick-development-diagnostics")).toHaveCount(0);
  await captureTacticalEvidence(page, testInfo, "kick-arrow-and-contact-modal");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("gridcell", { name: "Upper right contact", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => {
    const samples: Array<{ x: number; y: number; z: number }> = [];
    let active = true;
    let animationFrame = 0;
    const record = () => {
      const point = (
        globalThis as typeof globalThis & {
          __OVERGOAL_E2E_READ_LIVE_BALL__?: () => {
            x: number;
            y: number;
            z: number;
          } | null;
        }
      ).__OVERGOAL_E2E_READ_LIVE_BALL__?.();
      const previous = samples.at(-1);
      if (
        point &&
        (!previous ||
          previous.x !== point.x ||
          previous.y !== point.y ||
          previous.z !== point.z)
      ) {
        samples.push({ ...point });
      }
      if (active) animationFrame = requestAnimationFrame(record);
    };
    record();
    Object.assign(globalThis, {
      __OVERGOAL_E2E_SHORT_FLIGHT_SAMPLES__: samples,
      __OVERGOAL_E2E_SHORT_FLIGHT_STOP__: () => {
        active = false;
        cancelAnimationFrame(animationFrame);
      },
    });
  });
  // Fire two same-turn activations before React applies the disabled state.
  // The production action-id gate must therefore reject the second request.
  await page.getByTestId("kick-submit").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-field-visual-phase",
    "resolving",
  );
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  const flightSamples = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __OVERGOAL_E2E_SHORT_FLIGHT_SAMPLES__?: Array<{
        x: number;
        y: number;
        z: number;
      }>;
      __OVERGOAL_E2E_SHORT_FLIGHT_STOP__?: () => void;
    };
    state.__OVERGOAL_E2E_SHORT_FLIGHT_STOP__?.();
    return state.__OVERGOAL_E2E_SHORT_FLIGHT_SAMPLES__ ?? [];
  });
  expect(flightSamples.length).toBeGreaterThanOrEqual(4);
  expect(flightSamples.at(-1)).toEqual({ x: 54, y: 8, z: 0.11, t: 0.3 });
  await expect(
    page.getByText(`${authoritativeResultMinute}' · OPEN_PLAY`, {
      exact: true,
    }),
  ).toBeVisible();
  const resultCopy = await page.locator("body").innerText();
  expect(resultCopy).not.toContain("Waiting for field state.");
  expect(resultCopy).not.toContain("No backend field state");
  expect(submittedRequests).toHaveLength(1);
  expect(submittedRequests[0]).toMatchObject({
    match_decision: {
      choice: "KICK",
      kick_input: {
        version: 1,
        aim: { x: expect.any(Number), y: expect.any(Number) },
        power: expect.any(Number),
        contact: { x: expect.any(Number), y: expect.any(Number) },
      },
    },
  });
  const submittedPower = (
    submittedRequests[0] as {
      match_decision: { kick_input: { power: number } };
    }
  ).match_decision.kick_input.power;
  expect(submittedPower).toBe(
    canonicalScene("OPEN_PLAY").pending_action.control_envelope.maximum_power,
  );
  expect(
    (
      submittedRequests[0] as {
        match_decision: {
          kick_input: { contact: { x: number; y: number } };
        };
      }
    ).match_decision.kick_input.contact,
  ).toEqual(
    contactForGridIndex(
      2,
      canonicalScene("OPEN_PLAY").pending_action.control_envelope
        .contact_radius,
    ),
  );
  expect(JSON.stringify(submittedRequests[0])).not.toMatch(
    /seed|selection_quality|intent_hint|target|curve|lift/u,
  );
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-field-visual-phase",
    "resolved",
  );
  await page.getByTestId("next-action").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page).toHaveURL(/\/match\/match-open_play$/u);
  await expect(page.getByTestId("scene-contract-error")).toHaveCount(0);
});

test("plays authoritative teammate control and its later continuation field state", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  await enableDebugResultContinuation(page);
  const response = controlledKickResponse();
  const expectation = controlledResultExpectation;
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        withCommittedActionReceipt(controlledKickScene(), response, {
          decisionData: request.match_decision,
        }),
      ),
    });
  });

  await authenticateForContinuation(page);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await hydrateScene(page, controlledKickScene());
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  const legendAnchor = page.getByTestId("legend-player-anchor");
  await expect(legendAnchor).toBeAttached();
  const cameraAnchor = page.getByTestId("field-camera-anchor");
  await expect(cameraAnchor).toBeAttached();
  const receiverProbe = page.locator(
    `[data-testid="player-render-probe"][data-player-id="${expectation.receiverId}"]`,
  );
  await expect(receiverProbe).toBeAttached();
  await page.evaluate((receiverId) => {
    const probe = document.querySelector<HTMLElement>(
      `[data-testid="player-render-probe"][data-player-id="${receiverId}"]`,
    );
    if (!probe) throw new Error("Receiver render probe is unavailable");
    const samples: number[] = [];
    const record = () => {
      const value = Number(probe.dataset.rotationY);
      if (!Number.isFinite(value) || samples.at(-1) === value) return;
      samples.push(value);
    };
    record();
    const observer = new MutationObserver(record);
    observer.observe(probe, {
      attributes: true,
      attributeFilter: ["data-rotation-y"],
    });
    Object.assign(globalThis, {
      __OVERGOAL_E2E_RECEIVER_ROTATION_OBSERVER__: observer,
      __OVERGOAL_E2E_RECEIVER_ROTATION_SAMPLES__: samples,
    });
  }, expectation.receiverId);
  const anchorBeforeKick = await cameraAnchor.boundingBox();
  if (!anchorBeforeKick)
    throw new Error("Legend camera anchor is not measurable");
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  await page.evaluate(() => {
    document.body.dataset.kickResultResolvedSeen = "false";
    const observer = new MutationObserver(() => {
      const result = document.querySelector('[data-testid="kick-result"]');
      if (result?.textContent?.includes("Resolved")) {
        document.body.dataset.kickResultResolvedSeen = "true";
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByTestId("kick-submit").click();

  const result = page.getByTestId("kick-result");
  const field = page.getByTestId("game-field");
  await expect(result).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  const anchorDuringPlayback = await cameraAnchor.boundingBox();
  if (!anchorDuringPlayback)
    throw new Error("Legend camera anchor disappeared during playback");
  expect(Math.abs(anchorDuringPlayback.x - anchorBeforeKick.x)).toBeLessThan(1);
  expect(Math.abs(anchorDuringPlayback.y - anchorBeforeKick.y)).toBeLessThan(1);
  await expect(field).toHaveAttribute("data-result-animating", "false", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  const expectedRenderedState = {
    resultMinute: String(expectation.actionMinute),
    continuationMinute: String(expectation.continuationMinute),
    receiverId: expectation.receiverId,
    receiverX: String(expectation.resultReceiverPosition.x),
    receiverY: String(expectation.resultReceiverPosition.y),
    controlCarrierId: expectation.receiverId,
    carrierId: expectation.receiverId,
    carrierX: String(expectation.receiverPosition.x),
    carrierY: String(expectation.receiverPosition.y),
    carrierHasBall: "true",
    resultFacingX: String(expectation.facingTarget.x),
    resultFacingY: String(expectation.facingTarget.y),
    resultFacingPlayerId: expectation.facingTarget.playerId,
    carrierFacingX: String(expectation.facingTarget.x),
    carrierFacingY: String(expectation.facingTarget.y),
    carrierFacingPlayerId: expectation.facingTarget.playerId,
    resultCarryOffset: String(expectation.carryOffsetM),
    carrierCarryOffset: String(expectation.carryOffsetM),
    ballX: String(expectation.ballPosition.x),
    ballY: String(expectation.ballPosition.y),
    legendPlayerId: controlledKickScene().field_state.legend_player_id,
    resultCopy: expect.stringContaining(
      `${expectation.actionMinute}' · OPEN_PLAY`,
    ),
  };
  const renderedState = await controlledResultRenderState(field);
  expect(renderedState).toMatchObject(expectedRenderedState);
  await expect
    .poll(() =>
      page.locator("body").getAttribute("data-kick-result-resolved-seen"),
    )
    .toBe("true");
  const anchorAfterPlayback = await cameraAnchor.boundingBox();
  if (!anchorAfterPlayback)
    throw new Error("Legend camera anchor disappeared after playback");
  expect(Math.abs(anchorAfterPlayback.x - anchorBeforeKick.x)).toBeLessThan(1);
  expect(Math.abs(anchorAfterPlayback.y - anchorBeforeKick.y)).toBeLessThan(1);
  const rotationEvidence = await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __OVERGOAL_E2E_RECEIVER_ROTATION_OBSERVER__?: MutationObserver;
      __OVERGOAL_E2E_RECEIVER_ROTATION_SAMPLES__?: number[];
    };
    state.__OVERGOAL_E2E_RECEIVER_ROTATION_OBSERVER__?.disconnect();
    return state.__OVERGOAL_E2E_RECEIVER_ROTATION_SAMPLES__ ?? [];
  });
  const targetRotation = Number(
    await receiverProbe.getAttribute("data-target-rotation-y"),
  );
  expect(rotationEvidence.length).toBeGreaterThanOrEqual(3);
  expect(angularDistance(rotationEvidence[0], targetRotation)).toBeGreaterThan(
    0.05,
  );
  expect(
    rotationEvidence
      .slice(1, -1)
      .some((sample) => angularDistance(sample, targetRotation) > 0.01),
  ).toBe(true);
  expect(
    angularDistance(rotationEvidence.at(-1) ?? Number.NaN, targetRotation),
  ).toBeLessThan(0.03);

  const receiverScreenPosition = await receiverProbe.boundingBox();
  const ballProbe = page.getByTestId("ball-render-probe");
  const ballScreenPosition = await ballProbe.boundingBox();
  if (!receiverScreenPosition || !ballScreenPosition) {
    throw new Error("Receiver carry render probes are not measurable");
  }
  expect(ballScreenPosition.y).toBeLessThan(receiverScreenPosition.y);
  const carryDeltaM = Math.hypot(
    (expectation.ballPosition.x - expectation.receiverPosition.x) * 0.68,
    (expectation.ballPosition.y - expectation.receiverPosition.y) * 1.05,
  );
  expect(carryDeltaM).toBeCloseTo(expectation.carryOffsetM, 6);
  expect(expectation.continuationMinute).toBeGreaterThan(
    expectation.actionMinute,
  );
  expect(renderedState.legendPlayerId).not.toBe(expectation.receiverId);
  expect(renderedState.bodyCopy).not.toMatch(/(^|\n)Field($|\n)/u);
  expect(renderedState.bodyCopy).not.toContain("Waiting for field state.");
  expect(renderedState.bodyCopy).not.toContain("No backend field state");

  await page.getByTestId("next-action").click();
  await expect(page).toHaveURL(/\/match\/match-controlled-pass$/u);
});

for (const outcome of [
  "goal",
  "saved",
  "missed",
  "blocked",
] as const satisfies readonly AutomaticFinishFixtureOutcome[]) {
  test(`plays the complete authoritative teammate ${outcome} sequence`, async ({
    context,
    page,
  }, testInfo) => {
    test.slow();
    await enableDebugResultContinuation(page);
    const response = automaticKickResponse(outcome);
    const scene = automaticKickScene();
    const expectation = automaticFinishExpectation(outcome);
    await context.route("**/api/processMatchAction", async (route) => {
      const request = route.request().postDataJSON() as {
        match_decision: Record<string, unknown>;
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Match-API-Version": "1" },
        body: JSON.stringify(
          withCommittedActionReceipt(scene, response, {
            decisionData: request.match_decision,
          }),
        ),
      });
    });

    await authenticateForContinuation(page);
    await page.waitForFunction(
      () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
    );
    await hydrateScene(page, scene);
    await page.evaluate(() => {
      Object.assign(globalThis, {
        __OVERGOAL_E2E_HOLD_AUTOMATIC_RESPONSE__: true,
      });
    });
    const cameraAnchorBefore = await page
      .getByTestId("field-camera-anchor")
      .boundingBox();
    await page.evaluate(() => {
      const samples: Array<{ x: number; y: number; z: number }> = [];
      const phases: string[] = [];
      const field = document.querySelector('[data-testid="game-field"]');
      const observer = new MutationObserver(() => {
        const phase = field?.getAttribute("data-automatic-finish-phase");
        if (phase && phase !== "none" && phases[phases.length - 1] !== phase) {
          phases.push(phase);
        }
      });
      if (field) {
        observer.observe(field, { attributes: true });
      }
      let active = true;
      let animationFrame = 0;
      const record = () => {
        const point = (
          globalThis as typeof globalThis & {
            __OVERGOAL_E2E_READ_LIVE_BALL__?: () => {
              x: number;
              y: number;
              z: number;
            } | null;
          }
        ).__OVERGOAL_E2E_READ_LIVE_BALL__?.();
        const previous = samples[samples.length - 1];
        if (
          point &&
          (!previous ||
            previous.x !== point.x ||
            previous.y !== point.y ||
            previous.z !== point.z)
        ) {
          samples.push({ ...point });
        }
        if (active) animationFrame = requestAnimationFrame(record);
      };
      record();
      Object.assign(globalThis, {
        __OVERGOAL_E2E_AUTOMATIC_SEQUENCE__: { phases, samples },
        __OVERGOAL_E2E_AUTOMATIC_SEQUENCE_STOP__: () => {
          active = false;
          observer.disconnect();
          cancelAnimationFrame(animationFrame);
        },
      });
    });

    const target = page.getByTestId("ball-aim-target");
    await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
    await reverseDragFromBall(
      page,
      target,
      testInfo.project.name === "mobile-chromium",
    );
    await page.getByTestId("kick-submit").click();
    const field = page.getByTestId("game-field");
    await expect(field).toHaveAttribute(
      "data-automatic-finish-outcome",
      expectation.presentationOutcome,
      { timeout: 20_000 },
    );
    await expect(field).toHaveAttribute(
      "data-automatic-finish-phase",
      "response",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("kick-result")).toHaveCount(0);
    await expect(field).toHaveAttribute(
      "data-automatic-score-confirmed",
      "false",
    );
    await expect(field).toHaveAttribute(
      "data-automatic-confirmed-my-team-score",
      "",
    );
    if (testInfo.project.name === "mobile-chromium") {
      const evidencePath = process.env.OVERGOAL_EVIDENCE_DIR
        ? join(
            process.env.OVERGOAL_EVIDENCE_DIR,
            `automatic-${outcome}-response-mobile.png`,
          )
        : undefined;
      const screenshot = await page.screenshot({ path: evidencePath });
      await testInfo.attach(`automatic-${outcome}-response-mobile`, {
        body: screenshot,
        contentType: "image/png",
      });
    }
    await page.waitForFunction(
      () => "__OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__" in globalThis,
    );
    await page.evaluate(() => {
      const state = globalThis as typeof globalThis & {
        __OVERGOAL_E2E_HOLD_AUTOMATIC_RESPONSE__?: boolean;
        __OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__?: () => void;
      };
      const release = state.__OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__;
      delete state.__OVERGOAL_E2E_HOLD_AUTOMATIC_RESPONSE__;
      delete state.__OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__;
      release?.();
    });
    const actor = page.locator(
      `[data-testid="player-render-probe"][data-player-id="${automaticShotExpectation.receiverId}"]`,
    );
    const responder = page.locator(
      `[data-testid="player-render-probe"][data-player-id="${expectation.contactPlayerId ?? "team_2_GK_1"}"]`,
    );
    await expect(actor).toHaveAttribute("data-automatic-role", "actor");
    await expect(responder).toHaveAttribute("data-automatic-role", "responder");
    const cameraAnchorDuring = await page
      .getByTestId("field-camera-anchor")
      .boundingBox();
    expect(cameraAnchorDuring?.x).toBeCloseTo(cameraAnchorBefore?.x ?? 0, 1);
    expect(cameraAnchorDuring?.y).toBeCloseTo(cameraAnchorBefore?.y ?? 0, 1);

    await expect(field).toHaveAttribute(
      "data-automatic-finish-phase",
      "confirmed",
      { timeout: 20_000 },
    );
    await expect(field).toHaveAttribute(
      "data-automatic-score-confirmed",
      "true",
    );
    await expect(field).toHaveAttribute(
      "data-automatic-confirmed-my-team-score",
      String(expectation.score),
    );
    await expect(page.getByTestId("kick-result")).toHaveCount(1);
    await expect(page.getByTestId("kick-result")).toHaveAttribute(
      "data-outcome-type",
      expectation.outcomeType,
    );
    const sequence = await page.evaluate(() => {
      const state = globalThis as typeof globalThis & {
        __OVERGOAL_E2E_AUTOMATIC_SEQUENCE__?: {
          phases: string[];
          samples: Array<{ x: number; y: number; z: number }>;
        };
        __OVERGOAL_E2E_AUTOMATIC_SEQUENCE_STOP__?: () => void;
      };
      state.__OVERGOAL_E2E_AUTOMATIC_SEQUENCE_STOP__?.();
      return state.__OVERGOAL_E2E_AUTOMATIC_SEQUENCE__;
    });
    expect(sequence?.phases).toEqual([
      "incoming",
      "control",
      "shot",
      "response",
      "confirmed",
    ]);
    expect(
      sequence?.phases.filter((phase) => phase === "response"),
    ).toHaveLength(1);
    const distanceTo = (
      point: { x: number; y: number },
      targetPoint: { x: number; y: number },
    ) =>
      Math.hypot(
        (point.x - targetPoint.x) * 0.68,
        (point.y - targetPoint.y) * 1.05,
      );
    const receiveIndex =
      sequence?.samples.findIndex(
        (point) =>
          distanceTo(point, automaticShotExpectation.receivePoint) < 0.65,
      ) ?? -1;
    const shotFinalIndex =
      sequence?.samples.findIndex(
        (point, index) =>
          index > receiveIndex &&
          distanceTo(point, expectation.finalPoint) < 0.65,
      ) ?? -1;
    expect(receiveIndex, JSON.stringify(sequence?.samples)).toBeGreaterThan(0);
    expect(shotFinalIndex, JSON.stringify(sequence?.samples)).toBeGreaterThan(
      receiveIndex,
    );
  });
}

test("fails safely when teammate control is missing its authoritative contract", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  const response = controlledKickResponse();
  const malformedDecisionResult = {
    ...response.decision_result,
    receiver_control: undefined,
  };
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    const malformedResponse = {
      ...response,
      decision_result: malformedDecisionResult,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify({
        ...withCommittedActionReceipt(
          controlledKickScene(),
          malformedResponse,
          { decisionData: request.match_decision },
        ),
      }),
    });
  });

  await authenticateForContinuation(page);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  const controlledScene = controlledKickScene();
  await hydrateScene(page, controlledScene);
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  await page.getByTestId("kick-submit").click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("scene-contract-error")).toContainText(
    "invalid success response",
  );
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-ball-y",
    String(controlledScene.field_state.ball_y),
  );
});

test("captures continuous tactical arrow visuals at short, maximum, diagonal, and edge pulls", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticateForContinuation(page);
  await hydrateScene(page, canonicalScene("FREE_KICK"));
  await waitForRenderableTacticalScene(page, "FREE_KICK");
  await expectTacticalCanvasFillsViewport(page);
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });

  await previewAimArrow(page, target, { x: -10, y: 6 }, "short", testInfo);
  await previewAimArrow(page, target, { x: -260, y: 0 }, "maximum", testInfo);
  await previewAimArrow(page, target, { x: -120, y: 92 }, "diagonal", testInfo);
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("The live ball aim target is not measurable.");
  await previewAimArrow(
    page,
    target,
    {
      x: 8 - (bounds.x + bounds.width / 2),
      y: 4 - (bounds.y + bounds.height / 2),
    },
    "viewport-edge",
    testInfo,
  );
});

test("captures the rendered authoritative tactical result", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  await enableDebugResultContinuation(page);
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        committedKickResponse("PENALTY", request.match_decision),
      ),
    });
  });
  await authenticateForContinuation(page);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await hydrateScene(page, canonicalScene("PENALTY"));
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await expectTacticalCanvasFillsViewport(page);
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  await page.getByTestId("kick-submit").click();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page.getByText("39' · PENALTY", { exact: true })).toBeVisible();
  await captureTacticalEvidence(page, testInfo, "kick-result-playback", false);
});

test("renders authoritative player contact below 2 m and clearance above 2 m", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await enableDebugResultContinuation(page);
  const cases = [
    {
      name: "below-reach",
      scene: lobBelowScene,
      response: lobBelowResponse,
      clearsReach: false,
    },
    {
      name: "above-reach",
      scene: lobAboveScene,
      response: lobAboveResponse,
      clearsReach: true,
    },
  ] as const;
  const responses = new Map(
    cases.map((entry) => [entry.scene.match.id, entry] as const),
  );
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_id: string;
      match_decision: Record<string, unknown>;
    };
    const entry = responses.get(request.match_id);
    if (!entry) throw new Error(`Unexpected lob match ${request.match_id}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        withCommittedActionReceipt(entry.scene, entry.response, {
          decisionData: request.match_decision,
        }),
      ),
    });
  });

  await authenticateForContinuation(page);
  for (const entry of cases) {
    await test.step(entry.name, async () => {
      await hydrateScene(page, structuredClone(entry.scene));
      const target = page.getByTestId("ball-aim-target");
      await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
      const defenderId = "team_2_RB_2";
      await expect(
        page.locator(
          `[data-testid="player-reach-probe"][data-player-id="${defenderId}"]`,
        ),
      ).toBeAttached();
      await page.evaluate((playerId) => {
        const samples: Array<{
          animating: string | undefined;
          ballFieldX: number;
          ballFieldY: number;
          ballZ: number;
          rootBallY: number;
          rootBallZ: number;
        }> = [];
        let best:
          | {
              ballFieldX: number;
              ballFieldY: number;
              ballZ: number;
              distanceM: number;
            }
          | undefined;
        let active = true;
        let animationFrame = 0;
        const record = () => {
          const reach = document.querySelector<HTMLElement>(
            `[data-testid="player-reach-probe"][data-player-id="${playerId}"]`,
          );
          const field = document.querySelector<HTMLElement>(
            '[data-testid="game-field"]',
          );
          const liveBall = (
            globalThis as typeof globalThis & {
              __OVERGOAL_E2E_READ_LIVE_BALL__?: () => {
                x: number;
                y: number;
                z: number;
              } | null;
            }
          ).__OVERGOAL_E2E_READ_LIVE_BALL__?.();
          if (liveBall && reach) {
            const ballFieldX = liveBall.x;
            const ballFieldY = liveBall.y;
            const ballZ = liveBall.z;
            const playerX = Number(reach.dataset.playerX);
            const playerY = Number(reach.dataset.playerY);
            const sample = {
              animating: field?.dataset.resultAnimating,
              ballFieldX,
              ballFieldY,
              ballZ,
              rootBallY: Number(field?.dataset.ballY),
              rootBallZ: Number(field?.dataset.ballZ),
            };
            const previous = samples.at(-1);
            if (
              !previous ||
              previous.animating !== sample.animating ||
              previous.ballFieldX !== sample.ballFieldX ||
              previous.ballFieldY !== sample.ballFieldY ||
              previous.ballZ !== sample.ballZ ||
              previous.rootBallY !== sample.rootBallY ||
              previous.rootBallZ !== sample.rootBallZ
            ) {
              samples.push(sample);
              Object.assign(globalThis, {
                __OVERGOAL_E2E_LOB_SAMPLES__: samples,
              });
            }
            const segmentStart =
              previous?.animating === "true" && sample.animating === "true"
                ? previous
                : sample;
            const startX = (segmentStart.ballFieldX - playerX) * 0.68;
            const startY = (segmentStart.ballFieldY - playerY) * 1.05;
            const deltaX = (sample.ballFieldX - segmentStart.ballFieldX) * 0.68;
            const deltaY = (sample.ballFieldY - segmentStart.ballFieldY) * 1.05;
            const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
            const alpha =
              segmentLengthSquared > 0
                ? Math.max(
                    0,
                    Math.min(
                      1,
                      -(startX * deltaX + startY * deltaY) /
                        segmentLengthSquared,
                    ),
                  )
                : 0;
            const closestX = startX + deltaX * alpha;
            const closestY = startY + deltaY * alpha;
            const distanceM = Math.hypot(closestX, closestY);
            if (
              Number.isFinite(distanceM) &&
              distanceM < (best?.distanceM ?? 99)
            ) {
              best = {
                ballFieldX:
                  segmentStart.ballFieldX +
                  (sample.ballFieldX - segmentStart.ballFieldX) * alpha,
                ballFieldY:
                  segmentStart.ballFieldY +
                  (sample.ballFieldY - segmentStart.ballFieldY) * alpha,
                ballZ:
                  segmentStart.ballZ +
                  (sample.ballZ - segmentStart.ballZ) * alpha,
                distanceM,
              };
              Object.assign(globalThis, { __OVERGOAL_E2E_LOB_FRAME__: best });
            }
          }
          if (active) animationFrame = requestAnimationFrame(record);
        };
        record();
        Object.assign(globalThis, {
          __OVERGOAL_E2E_LOB_FRAME_STOP__: () => {
            active = false;
            cancelAnimationFrame(animationFrame);
          },
        });
      }, defenderId);

      await reverseDragFromBall(
        page,
        target,
        testInfo.project.name === "mobile-chromium",
      );
      await page.getByTestId("kick-submit").click();
      const field = page.getByTestId("game-field");
      await expect(field).toHaveAttribute("data-result-animating", "true", {
        timeout: 20_000,
      });
      await expect(field).toHaveAttribute("data-result-animating", "false", {
        timeout: 20_000,
      });
      await page.waitForTimeout(100);
      const frame = await page.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          __OVERGOAL_E2E_LOB_FRAME__?: {
            ballFieldX: number;
            ballFieldY: number;
            ballZ: number;
            distanceM: number;
          };
          __OVERGOAL_E2E_LOB_SAMPLES__?: Array<{
            animating: string | undefined;
            ballFieldX: number;
            ballFieldY: number;
            ballZ: number;
            rootBallY: number;
            rootBallZ: number;
          }>;
          __OVERGOAL_E2E_LOB_FRAME_STOP__?: () => void;
        };
        state.__OVERGOAL_E2E_LOB_FRAME_STOP__?.();
        return {
          frame: state.__OVERGOAL_E2E_LOB_FRAME__,
          samples: state.__OVERGOAL_E2E_LOB_SAMPLES__ ?? [],
        };
      });
      expect(frame.frame).toBeDefined();
      expect(
        frame.frame?.distanceM,
        JSON.stringify(frame.samples),
      ).toBeLessThan(0.65);
      const decisionResult = entry.response.decision_result as {
        flight_outcome: string;
        interceptor?: { id: string } | null;
      };
      if (entry.clearsReach) {
        expect(frame.frame?.ballZ).toBeGreaterThan(2);
        expect(decisionResult.interceptor ?? null).toBeNull();
        expect(decisionResult.flight_outcome).toBe("GOAL");
      } else {
        expect(frame.frame?.ballZ).toBeLessThan(2);
        expect(decisionResult.interceptor?.id).toBe(defenderId);
        expect(decisionResult.flight_outcome).toBe("DEFENDER_INTERCEPT");
      }
      await captureTacticalEvidence(
        page,
        testInfo,
        `kick-${entry.name}-result`,
        false,
      );
    });
  }
});

test("shows each failed pass consequence before its result copy", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await enableDebugResultContinuation(page);
  const cases = failedPassFixtures();
  const responses = new Map(
    cases.map((entry) => [entry.scene.match.id, entry]),
  );
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_id: string;
      match_decision: Record<string, unknown>;
    };
    const entry = responses.get(request.match_id);
    if (!entry)
      throw new Error(`Unexpected failed-pass match ${request.match_id}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        withCommittedActionReceipt(entry.scene, entry.response, {
          decisionData: request.match_decision,
        }),
      ),
    });
  });

  await authenticateForContinuation(page);
  for (const entry of cases) {
    await test.step(entry.name, async () => {
      await hydrateScene(page, structuredClone(entry.scene));
      const target = page.getByTestId("ball-aim-target");
      await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
      await reverseDragFromBall(
        page,
        target,
        testInfo.project.name === "mobile-chromium",
      );
      await page.getByTestId("kick-submit").click();

      const field = page.getByTestId("game-field");
      await expect(field).toHaveAttribute(
        "data-result-reaction",
        entry.expectedFamily,
      );
      await expect
        .poll(() => field.getAttribute("data-result-reaction-visible"), {
          timeout: 20_000,
          intervals: [25],
        })
        .toBe("true");
      await expect(page.getByTestId("kick-result")).toHaveCount(0);

      if (entry.expectedPlayerId) {
        const probe = page.locator(
          `[data-testid="player-render-probe"][data-player-id="${entry.expectedPlayerId}"]`,
        );
        await expect(probe).toHaveAttribute(
          "data-reaction-family",
          entry.expectedFamily,
        );
      }

      await captureTacticalEvidence(
        page,
        testInfo,
        `failed-pass-${entry.name}-reaction`,
        false,
      );
      await expect(field).toHaveAttribute(
        "data-ball-x",
        String(entry.finalPoint.x),
      );
      await expect(field).toHaveAttribute(
        "data-ball-y",
        String(entry.finalPoint.y),
      );
      await expect(field).toHaveAttribute(
        "data-result-reaction-visible",
        "false",
      );
      await expect(page.getByTestId("kick-result")).toBeVisible();
      await expect(field).toHaveAttribute(
        "data-ball-x",
        String(entry.finalPoint.x),
      );
      await expect(field).toHaveAttribute(
        "data-ball-y",
        String(entry.finalPoint.y),
      );
    });
  }
});

test("automatically continues an authoritative tactical result after its hold", async ({
  context,
  page,
}) => {
  test.slow();
  await context.route("**/api/processMatchAction", async (route) => {
    const request = route.request().postDataJSON() as {
      match_decision: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(
        committedKickResponse("PENALTY", request.match_decision),
      ),
    });
  });
  await authenticateForContinuation(page);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await hydrateScene(page, canonicalScene("PENALTY"));
  const target = page.getByTestId("ball-aim-target");
  await expect(target).toBeVisible({ timeout: FIELD_READY_TIMEOUT_MS });
  await reverseDragFromBall(
    page,
    target,
    test.info().project.name === "mobile-chromium",
  );
  await page.evaluate(() => {
    document.body.dataset.resultResolvedAt = "";
    document.body.dataset.resultRemovedAt = "";
    const recordResultLifecycle = () => {
      const result = document.querySelector('[data-testid="kick-result"]');
      if (
        result?.textContent?.includes("Resolved") &&
        !document.body.dataset.resultResolvedAt
      ) {
        document.body.dataset.resultResolvedAt = String(performance.now());
      }
      if (
        document.body.dataset.resultResolvedAt &&
        !result &&
        !document.body.dataset.resultRemovedAt
      ) {
        document.body.dataset.resultRemovedAt = String(performance.now());
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(recordResultLifecycle);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByTestId("kick-submit").click();
  await expect(page.getByTestId("kick-result")).toBeVisible({
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page).toHaveURL(/\/match\/match-penalty$/u, {
    timeout: 15_000,
  });
  const resultLifecycle = await page.locator("body").evaluate((body) => ({
    removedAt: Number(body.dataset.resultRemovedAt),
    resolvedAt: Number(body.dataset.resultResolvedAt),
  }));
  expect(resultLifecycle.resolvedAt).toBeGreaterThan(0);
  expect(resultLifecycle.removedAt).toBeGreaterThan(resultLifecycle.resolvedAt);
  expect(
    resultLifecycle.removedAt - resultLifecycle.resolvedAt,
  ).toBeGreaterThanOrEqual(2_400);
  expect(resultLifecycle.removedAt - resultLifecycle.resolvedAt).toBeLessThan(
    8_000,
  );
});

// WEBGL_lose_context can degrade SwiftShader for the rest of a browser worker,
// so this destructive lifecycle proof intentionally runs after interaction visuals.
test("invalidates field readiness across WebGL context loss and restoration", async ({
  page,
}) => {
  test.slow();
  await authenticateForContinuation(page);
  await hydrateScene(page, canonicalScene("OPEN_PLAY"));
  await waitForRenderableTacticalScene(page, "OPEN_PLAY");

  const field = page.getByTestId("game-field");
  const contextExtensionAvailable = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="game-field"] canvas',
    );
    const context =
      canvas?.getContext("webgl2") ?? canvas?.getContext("webgl") ?? null;
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    canvas?.addEventListener(
      "webglcontextlost",
      () => window.setTimeout(() => extension.restoreContext(), 800),
      { once: true },
    );
    extension.loseContext();
    return true;
  });
  expect(contextExtensionAvailable).toBe(true);

  await expect(field).toHaveAttribute("data-render-ready", "false");
  await expect(field).toHaveAttribute(
    "data-field-visual-phase",
    "transitioning",
  );
  await expect(page.getByTestId("field-loading-overlay")).toHaveCount(0);
  await expect(page.getByTestId("ball-aim-target")).toHaveCount(0);
  await expect(field).toHaveAttribute("data-render-ready", "true", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(field).toHaveAttribute("data-field-visual-phase", "playable");
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible();
});
