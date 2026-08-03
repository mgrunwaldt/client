import {
  expect,
  type Locator,
  type Page,
  test,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";

import {
  controlledKickResponse,
  controlledResultExpectation,
} from "../tests/fixtures/tactical-kick-scenes/controlled-result";
import cornerScene from "../tests/fixtures/tactical-kick-scenes/corner.json" with { type: "json" };
import freeKickScene from "../tests/fixtures/tactical-kick-scenes/free-kick.json" with { type: "json" };
import openPlayScene from "../tests/fixtures/tactical-kick-scenes/open-play.json" with { type: "json" };
import penaltyScene from "../tests/fixtures/tactical-kick-scenes/penalty.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";

const FIELD_READY_TIMEOUT_MS = 45_000;
const tacticalScenes = {
  OPEN_PLAY: openPlayScene,
  FREE_KICK: freeKickScene,
  CORNER: cornerScene,
  PENALTY: penaltyScene,
} as const;
type TacticalSceneType = keyof typeof tacticalScenes;
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
    ballPosition: ["50", "8"],
    description: "Your Legend receives the ball in open play.",
    maximumPower: "0.94",
    title: "Open Play",
    playerCount: "22",
    playerRoles:
      "CAM,DM,GK,GK,LAM,LB,LB,LCB,LCB,LCM,LDM,LW,RAM,RB,RB,RCB,RCB,RCM,RDM,RW,ST,ST",
    opponentRoles: "CAM,GK,LAM,LB,LCB,LDM,RAM,RB,RCB,RDM,ST",
  },
  FREE_KICK: {
    ballPosition: ["50", "19.05"],
    description: "Your Legend wins a dangerous free kick.",
    maximumPower: "0.94",
    title: "Free Kick",
    playerCount: "22",
    playerRoles:
      "CAM,DM,GK,GK,LAM,LB,LCB,LCM,LDM,LW,RAM,RB,RCB,RCM,RDM,RW,ST,ST,WALL,WALL,WALL,WALL",
    opponentRoles: "CAM,GK,LAM,LDM,RAM,RDM,ST,WALL,WALL,WALL,WALL",
  },
  CORNER: {
    ballPosition: ["99.63235294117646", "0.23809523809523808"],
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

function canonicalScene(sceneType: TacticalSceneType) {
  return structuredClone(tacticalScenes[sceneType]);
}

async function hydrateScene(page: Page, response: unknown) {
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

async function reverseDragFromBall(
  page: Page,
  target: Locator,
  mobile: boolean,
) {
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("The live ball aim target is not measurable.");
  const start = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const end = { x: start.x - 72, y: start.y + 54 };

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
  const end = { x: start.x + offset.x, y: start.y + offset.y };

  const mobile = testInfo.project.name === "mobile-chromium";
  const touchSession = mobile ? await page.context().newCDPSession(page) : null;
  if (touchSession) {
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [end],
    });
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
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The tactical viewport is not measurable.");
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
    .poll(() =>
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
    match: {
      ...response.match,
      current_time: continuationMinute,
      prev_time: actionMinute,
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

test("renders each canonical tactical scene with preloaded field assets", async ({
  page,
}, testInfo) => {
  test.slow();
  const sceneTypes = ["OPEN_PLAY", "FREE_KICK", "CORNER", "PENALTY"] as const;
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  const canvas = page.getByTestId("game-field").locator("canvas");

  for (const [index, sceneType] of sceneTypes.entries()) {
    await test.step(sceneType, async () => {
      await hydrateScene(page, canonicalScene(sceneType));
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
      await captureTacticalEvidence(
        page,
        testInfo,
        `tactical-${sceneType.toLowerCase()}`,
      );
    });
  }
});

test("requires fresh complete frames after resize and orientation change", async ({
  page,
}) => {
  test.slow();
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
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
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
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
  await page.goto("/game");
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
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("gridcell", { selected: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("gridcell", { name: "Center contact", exact: true }),
  ).toBeFocused();
  await expect(page.getByText(/^Center contact, x /u)).toBeAttached();

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

test("submits one canonical reverse-drag kick and plays the authoritative result", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  const submittedRequests: unknown[] = [];
  const authoritativeResponse = resolvedKickResponse();
  const authoritativeResultMinute =
    canonicalScene("OPEN_PLAY").pending_action.minute;
  await context.route("**/api/processMatchAction", async (route) => {
    submittedRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(authoritativeResponse),
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
    page.getByText(
      /Server power range: 16% - 94%; short pulls use the server floor\./u,
    ),
  ).toBeVisible();
  const displayedPower = await page
    .getByText(/Submitted power:/u)
    .textContent();
  await captureTacticalEvidence(page, testInfo, "kick-arrow-and-contact-modal");

  await page
    .getByTestId("kick-contact-ball")
    .click({ position: { x: 210, y: 60 } });
  // Fire two same-turn activations before React applies the disabled state.
  // The production action-id gate must therefore reject the second request.
  await page.getByTestId("kick-submit").evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId("kick-result")).toBeVisible();
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
  expect(displayedPower).toBe(
    `Submitted power: ${Math.round(submittedPower * 100)}%`,
  );
  expect(JSON.stringify(submittedRequests[0])).not.toMatch(
    /seed|selection_quality|intent_hint|target|curve|lift/u,
  );
  await expect(page).toHaveURL(/\/match\/match-open_play$/u);
});

test("plays authoritative teammate control and its later continuation field state", async ({
  context,
  page,
}, testInfo) => {
  test.slow();
  const response = controlledKickResponse();
  const expectation = controlledResultExpectation;
  await context.route("**/api/processMatchAction", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(response),
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
  await expect(result).toBeVisible();
  const expectedRenderedState = {
    resultMinute: String(expectation.actionMinute),
    continuationMinute: String(expectation.continuationMinute),
    receiverId: expectation.receiverId,
    receiverX: String(expectation.receiverPosition.x),
    receiverY: String(expectation.receiverPosition.y),
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
    legendPlayerId: canonicalScene("OPEN_PLAY").field_state.legend_player_id,
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
  expect(expectation.continuationMinute).toBeGreaterThan(
    expectation.actionMinute,
  );
  expect(renderedState.legendPlayerId).not.toBe(expectation.receiverId);
  expect(renderedState.bodyCopy).not.toMatch(/(^|\n)Field($|\n)/u);
  expect(renderedState.bodyCopy).not.toContain("Waiting for field state.");
  expect(renderedState.bodyCopy).not.toContain("No backend field state");

  await expect(page).toHaveURL(/\/match\/match-open_play$/u);
});

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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify({
        ...response,
        decision_result: malformedDecisionResult,
      }),
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
  await page.getByTestId("kick-submit").click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "invalid success response",
  );
  await expect(page.getByTestId("kick-result")).toHaveCount(0);
  await expect(page.getByTestId("game-field")).toHaveAttribute(
    "data-ball-y",
    sceneExpectations.OPEN_PLAY.ballPosition[1],
  );
});

test("captures continuous tactical arrow visuals at short, maximum, diagonal, and edge pulls", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
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
  await context.route("**/api/processMatchAction", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(resolvedKickResponse("PENALTY")),
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
  await expect(page.getByTestId("kick-result")).toBeVisible();
  await expect(page.getByText("39' · PENALTY", { exact: true })).toBeVisible();
  await captureTacticalEvidence(page, testInfo, "kick-result-playback", false);
});

test("automatically continues an authoritative tactical result after its hold", async ({
  context,
  page,
}) => {
  test.slow();
  await context.route("**/api/processMatchAction", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(resolvedKickResponse("PENALTY")),
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
  await expect(page.getByTestId("kick-result")).toBeVisible();
  await expect(page).toHaveURL(/\/match\/match-penalty$/u, {
    timeout: 8_000,
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
    5_000,
  );
});

// WEBGL_lose_context can degrade SwiftShader for the rest of a browser worker,
// so this destructive lifecycle proof intentionally runs after interaction visuals.
test("invalidates field readiness across WebGL context loss and restoration", async ({
  page,
}) => {
  test.slow();
  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
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
  await expect(page.getByTestId("field-loading-overlay")).toBeVisible();
  await expect(page.getByTestId("ball-aim-target")).toHaveCount(0);
  await expect(field).toHaveAttribute("data-render-ready", "true", {
    timeout: FIELD_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("field-loading-overlay")).toBeHidden();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible();
});
