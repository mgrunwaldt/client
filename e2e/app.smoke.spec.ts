import { expect, type Page, test } from "@playwright/test";

import waitingOpenPlayResponse from "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json" with { type: "json" };

const headlessGpuDiagnostic =
  /^warning: \[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/;

async function expectLazyRouteFallback(
  page: Page,
  path: string,
  chunkPattern: RegExp,
) {
  let releaseChunk = () => {};
  let markChunkIntercepted = () => {};
  const chunkReleased = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  const chunkIntercepted = new Promise<void>((resolve) => {
    markChunkIntercepted = resolve;
  });

  await page.route(chunkPattern, async (route) => {
    markChunkIntercepted();
    await chunkReleased;
    await route.continue();
  });

  const navigation = page.goto(path);
  await chunkIntercepted;
  const loadingSurface = page.getByRole("status", {
    name: "Loading Overgoal",
  });

  await expect(loadingSurface).toBeVisible();
  await expect(loadingSurface).toContainText("Preparing the next screen");

  releaseChunk();
  await navigation;
  await expect(loadingSurface).toBeHidden({ timeout: 15_000 });
}

test("mounts the login route without a fatal page error", async ({ page }) => {
  const browserDiagnostics: string[] = [];
  const gameAssetRequests: string[] = [];

  page.on("pageerror", (error) => browserDiagnostics.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      browserDiagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("request", (request) => {
    if (
      /\/(?:models|field)\/|\.(?:fbx|glb|gltf)(?:\?|$)/i.test(request.url())
    ) {
      gameAssetRequests.push(request.url());
    }
  });

  const response = await page.goto("/login");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Connect Controller" }),
  ).toBeVisible();
  await expect(page.getByText("Dojo Initialization Error")).toHaveCount(0);
  expect(gameAssetRequests).toEqual([]);
  expect(browserDiagnostics).toEqual([]);
});

test("shows a nonblank fallback while the login route chunk loads", async ({
  page,
}) => {
  await expectLazyRouteFallback(
    page,
    "/login",
    /\/assets\/LoginScreen-[^/]+\.js(?:\?.*)?$/,
  );
  await expect(
    page.getByRole("button", { name: "Connect Controller" }),
  ).toBeVisible();
});

test("shows a nonblank fallback while the game scene chunk loads", async ({
  page,
}) => {
  const browserDiagnostics: string[] = [];

  page.on("pageerror", (error) => browserDiagnostics.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) {
      browserDiagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });

  await expectLazyRouteFallback(
    page,
    "/game",
    /\/assets\/GameScene-[^/]+\.js(?:\?.*)?$/,
  );
  await expect(page.getByTestId("game-field")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(3_000);
  const unexpectedDiagnostics = browserDiagnostics.filter(
    (message) => !headlessGpuDiagnostic.test(message),
  );
  expect(unexpectedDiagnostics).toEqual([]);
});

test("uses a mobile viewport and dispatches touch input", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto("/login");

  expect(page.viewportSize()).toEqual({ height: 727, width: 393 });
  const touchCapabilities = (await page.evaluate(
    `({
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      maxTouchPoints: navigator.maxTouchPoints
    })`,
  )) as { coarsePointer: boolean; maxTouchPoints: number };
  expect(touchCapabilities).toEqual({ coarsePointer: true, maxTouchPoints: 1 });

  await page.evaluate(`(() => {
    document.body.dataset.lastPointerType = "";
    document.body.addEventListener("pointerdown", (event) => {
      document.body.dataset.lastPointerType = event.pointerType;
    }, { once: true });
  })()`);
  await page.locator("body").tap({ position: { x: 8, y: 8 } });
  await expect(page.locator("body")).toHaveAttribute(
    "data-last-pointer-type",
    "touch",
  );
});

test("renders a complete backend player scene without a fatal error", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  test.slow();

  const browserDiagnostics: string[] = [];
  page.on("pageerror", (error) => browserDiagnostics.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserDiagnostics.push(`error: ${message.text()}`);
    }
  });

  const myTeamFormation: Array<[string, number, number]> = [
    ["GK", 50, 7],
    ["LB", 16, 20],
    ["LCB", 36, 18],
    ["RCB", 64, 18],
    ["RB", 84, 20],
    ["LDM", 38, 31],
    ["RDM", 62, 31],
    ["LAM", 22, 43],
    ["CAM", 50, 46],
    ["RAM", 78, 43],
    ["ST", 52, 58],
  ];
  const myTeamPositions = myTeamFormation.map(([role, x, y], index) => ({
    id: `team_1_${role}_${index}`,
    role,
    x,
    y,
    is_legend: role === "ST",
    has_ball: role === "ST",
  }));
  const opponentFormation: Array<[string, number, number]> = [
    ["GK", 50, 94],
    ["LB", 16, 80],
    ["LCB", 36, 82],
    ["RCB", 64, 82],
    ["RB", 84, 80],
    ["LDM", 38, 69],
    ["RDM", 62, 69],
    ["LAM", 22, 57],
    ["CAM", 50, 54],
    ["RAM", 78, 57],
    ["ST", 50, 42],
  ];
  const opponentPositions = opponentFormation.map(([role, x, y], index) => ({
    id: `team_2_${role}_${index}`,
    role,
    x,
    y,
  }));
  const response = structuredClone(waitingOpenPlayResponse);
  const fieldState = response.pending_action.field_state;
  fieldState.my_team_positions = myTeamPositions;
  fieldState.opponent_positions = opponentPositions;
  fieldState.legend_player_id = "team_1_ST_10";
  fieldState.carrier_player_id = "team_1_ST_10";
  fieldState.context = {
    ...fieldState.context,
    carrier_player_id: "team_1_ST_10",
  };
  fieldState.ball_x = 52;
  fieldState.ball_y = 55.2;
  response.field_state = structuredClone(fieldState);

  await page.goto("/game");
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await page.evaluate(
    ({ matchResponse, myTeam, opponentTeam }) => {
      const setMatchResponse = (
        globalThis as unknown as {
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
    {
      matchResponse: response,
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
    },
  );

  const gameField = page.getByTestId("game-field");
  await expect(gameField).toHaveAttribute("data-player-count", "22");
  await expect(gameField.locator("canvas")).toBeVisible();
  await expect(
    page.getByText("Your Legend receives the ball in open play."),
  ).toBeVisible();
  await page.waitForTimeout(3_000);
  await testInfo.attach("complete-backend-player-scene", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  expect(browserDiagnostics).toEqual([]);
});

test("holds an active browser worker for the runner signal-cleanup proof", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.OVERGOAL_RUNNER_SIGNAL_PROOF !== "1" ||
      testInfo.project.name !== "chromium",
  );
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Connect Controller" }),
  ).toBeVisible();
  console.log("OVERGOAL_BROWSER_READY");
  await page.waitForTimeout(60_000);
});
