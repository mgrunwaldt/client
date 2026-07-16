import { expect, type Page, test } from "@playwright/test";

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
  await expect(loadingSurface).toBeHidden();
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
