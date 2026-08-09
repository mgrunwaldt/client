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
