import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("registers the production worker, restores navigation offline, and bypasses API cache", async ({
  context,
  page,
}) => {
  await context.route("**/api/pwa-runtime-probe", (route) =>
    route.fulfill({ status: 200, body: "network-only" }),
  );

  await page.goto("/login");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.locator("#root")).not.toBeEmpty();

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return {
      active: ready.active?.state,
      scope: ready.scope,
    };
  });
  expect(registration.active).toBe("activated");
  expect(new URL(registration.scope).pathname).toBe("/");

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const response = await fetch("/api/pwa-runtime-probe");
        return response.text();
      }),
    )
    .toBe("network-only");

  const apiWasCached = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const matches = await Promise.all(
      cacheNames.map((name) =>
        caches
          .open(name)
          .then((cache) => cache.match("/api/pwa-runtime-probe")),
      ),
    );
    return matches.some(Boolean);
  });
  expect(apiWasCached).toBe(false);

  await context.unroute("**/api/pwa-runtime-probe");
  await context.setOffline(true);
  const offlineApiResult = await page.evaluate(() =>
    fetch("/api/pwa-runtime-probe").then(
      () => "unexpected-response",
      () => "network-failed",
    ),
  );
  expect(offlineApiResult).toBe("network-failed");

  const offlineNavigation = await page.goto("/login?offline-runtime-probe=1", {
    waitUntil: "domcontentloaded",
  });
  expect(offlineNavigation?.ok()).toBe(true);
  await expect(page.locator("#root")).not.toBeEmpty();
});

test("keeps the mobile shell inside browser and standalone safe areas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  const screen = page.getByTestId("login-screen");
  const content = screen.locator(":scope > div");
  await expect(screen).toBeVisible();
  await expect(content).toHaveCount(2);

  const contentBoxes = () =>
    content.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      }),
    );

  const assertSafeContent = async () => {
    const boxes = await contentBoxes();
    expect(Math.min(...boxes.map((box) => box.top))).toBeGreaterThanOrEqual(47);
    expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(382);
    expect(Math.max(...boxes.map((box) => box.bottom))).toBeLessThanOrEqual(
      810,
    );
    expect(Math.min(...boxes.map((box) => box.left))).toBeGreaterThanOrEqual(8);
  };

  await expect(screen).toHaveScreenshot("pwa-browser-safe-area.png", {
    animations: "disabled",
  });

  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--overgoal-safe-top", "47px");
    root.style.setProperty("--overgoal-safe-right", "8px");
    root.style.setProperty("--overgoal-safe-bottom", "34px");
    root.style.setProperty("--overgoal-safe-left", "8px");
  });
  await assertSafeContent();
  await expect(screen).toHaveScreenshot("pwa-standalone-safe-area.png", {
    animations: "disabled",
  });
});
