import {
  expect,
  type Locator,
  type Page,
  test,
  type TestInfo,
} from "@playwright/test";
import { sepolia } from "@starknet-react/chains";
import sharp from "sharp";

import cornerScene from "../tests/fixtures/tactical-kick-scenes/corner.json" with { type: "json" };
import freeKickScene from "../tests/fixtures/tactical-kick-scenes/free-kick.json" with { type: "json" };
import openPlayScene from "../tests/fixtures/tactical-kick-scenes/open-play.json" with { type: "json" };
import penaltyScene from "../tests/fixtures/tactical-kick-scenes/penalty.json" with { type: "json" };

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
const encodedWallets = process.env.OVERGOAL_LOCAL_CI_WALLETS;

if (!encodedWallets) {
  throw new Error("OVERGOAL_LOCAL_CI_WALLETS is required by tactical E2E.");
}

const [wallet] = JSON.parse(encodedWallets) as Array<{ address: string }>;
const walletChainId = `0x${sepolia.id.toString(16)}`;
const csrfToken = `0x${"a".repeat(64)}`;

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

function authChallengeResponse() {
  return {
    challenge_id: `0x${"1".repeat(32)}`,
    action: "CREATE_SESSION",
    account_address: wallet.address,
    chain_id: walletChainId,
    expires_at: "2026-07-19T12:05:00.000Z",
    typed_data: {
      types: {
        StarknetDomain: [
          { name: "name", type: "shortstring" },
          { name: "version", type: "shortstring" },
          { name: "chainId", type: "shortstring" },
          { name: "revision", type: "shortstring" },
        ],
        OvergoalAuthChallenge: [{ name: "challenge_hash", type: "felt" }],
      },
      primaryType: "OvergoalAuthChallenge",
      domain: {
        name: "Overgoal Auth",
        version: "1",
        chainId: walletChainId,
        revision: "1",
      },
      message: { challenge_hash: "0x1" },
    },
  };
}

function authSessionResponse() {
  return {
    session: {
      issued_at: "2026-07-19T12:00:00.000Z",
      idle_expires_at: "2026-07-19T12:15:00.000Z",
      absolute_expires_at: "2026-07-20T12:00:00.000Z",
      subject: {
        provider: "starknet",
        chain_id: walletChainId,
        account_address: wallet.address,
      },
    },
    legend: { legend_id: "legend-tactical-e2e" },
    response_context: { cookie_csrf_token: csrfToken },
  };
}

async function authenticateForContinuation(page: Page) {
  await page.route("**/api/auth/v1/challenges", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(authChallengeResponse()),
    }),
  );
  await page.route("**/api/auth/v1/sessions", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: {
        "Set-Cookie":
          "__Host-overgoal_session=tactical-e2e; Path=/; Secure; HttpOnly; SameSite=Lax",
      },
      body: JSON.stringify(authSessionResponse()),
    }),
  );
  await page.route("**/api/auth/v1/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authSessionResponse()),
    }),
  );

  await page.goto("/login");
  await page.getByRole("button", { name: "Connect Controller" }).click();
  await expect(page).toHaveURL(/\/post-login-screen$/u);
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some(
        (cookie) => cookie.name === "__Host-overgoal_session",
      );
    })
    .toBe(true);
  await page.goto("/game");
}

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
  const screenshot = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    clip: {
      x: Math.max(
        0,
        Math.min(start.x - clipWidth / 2, viewport.width - clipWidth),
      ),
      y: Math.max(
        0,
        Math.min(start.y - clipHeight / 2, viewport.height - clipHeight),
      ),
      width: clipWidth,
      height: clipHeight,
    },
  });
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
) {
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
  context,
}, testInfo) => {
  test.slow();
  // Each isolated page must preload the actual stadium and 22-player assets.
  // The production preview deliberately serves these large assets without a
  // cache lifetime, so this matrix can exceed Playwright's default slow limit.
  test.setTimeout(240_000);
  const sceneTypes = ["OPEN_PLAY", "FREE_KICK", "CORNER", "PENALTY"] as const;
  for (const sceneType of sceneTypes) {
    const scenePage = await context.newPage();
    try {
      await scenePage.goto("/game");
      await scenePage.waitForFunction(
        () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
      );
      await hydrateScene(scenePage, canonicalScene(sceneType));
      await expect(
        scenePage.getByText(sceneExpectations[sceneType].title, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        scenePage.getByTestId("game-field").locator("canvas"),
      ).toBeVisible();
      await waitForRenderableTacticalScene(scenePage, sceneType);
      await captureTacticalEvidence(
        scenePage,
        testInfo,
        `tactical-${sceneType.toLowerCase()}`,
      );
    } finally {
      await scenePage.close();
    }
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
  await context.route("**/api/processMatchAction", async (route) => {
    submittedRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Match-API-Version": "1" },
      body: JSON.stringify(resolvedKickResponse()),
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
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("kick-result")).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    await page.getByTestId("kick-result").tap({ force: true });
  } else {
    await page.getByTestId("kick-result").click({ force: true });
  }
  await expect(page).toHaveURL(/\/match\/match-open_play$/u);
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
  await reverseDragFromBall(
    page,
    target,
    testInfo.project.name === "mobile-chromium",
  );
  await page.getByTestId("kick-submit").click();
  await expect(page.getByTestId("kick-result")).toBeVisible();
  await expect(page.getByText("39' · PENALTY", { exact: true })).toBeVisible();
  await captureTacticalEvidence(page, testInfo, "kick-result-playback");
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
  await page.getByTestId("kick-submit").click();
  await expect(page.getByTestId("kick-result")).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("kick-result")).toBeVisible();
  await expect(page).toHaveURL(/\/match\/match-penalty$/u, {
    timeout: 1_500,
  });
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
