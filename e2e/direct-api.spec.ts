import { expect, test } from "@playwright/test";

const matchApiBaseUrl = process.env.OVERGOAL_MATCH_API_BASE_URL;
const matchApiOrigin = matchApiBaseUrl
  ? new URL(matchApiBaseUrl).origin
  : "https://direct-api-not-configured.invalid";

test("enters a match through a real cross-origin bearer API", async ({
  page,
}) => {
  test.skip(!matchApiBaseUrl, "Direct API proof runs in its dedicated build.");
  test.setTimeout(120_000);
  const apiRequests: Array<{
    method: string;
    url: string;
    headers: Record<string, string>;
  }> = [];
  const preflightCounts: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== matchApiOrigin) return;
    apiRequests.push({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
    });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).origin !== matchApiOrigin) return;
    const count = Number(response.headers()["x-e2e-preflight-count"]);
    if (Number.isFinite(count)) preflightCounts.push(count);
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Connect Controller" }).click();
  await expect(page).toHaveURL(/\/post-login-screen$/u);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/pre-match\/match-direct-api-e2e$/u);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/match\/match-direct-api-e2e$/u, {
    timeout: 60_000,
  });
  await expect(page.getByText("LIVE", { exact: true }).first()).toBeVisible();

  expect(Math.max(...preflightCounts)).toBeGreaterThan(0);
  const protectedRequests = apiRequests.filter(({ url }) =>
    /\/(teams|createMatch|startMatch)$/u.test(new URL(url).pathname),
  );
  expect(protectedRequests.length).toBeGreaterThanOrEqual(3);
  for (const request of protectedRequests) {
    expect(request.headers.authorization).toBe(
      "Bearer overgoal-direct-e2e-bearer",
    );
    expect(request.headers.cookie).toBeUndefined();
  }
  expect(
    apiRequests.every(({ url }) => new URL(url).origin === matchApiOrigin),
  ).toBe(true);
});
