import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required; run browser tests with pnpm test:browser.",
  );
}

const parsedBaseUrl = new URL(baseURL);

if (
  parsedBaseUrl.protocol !== "https:" ||
  parsedBaseUrl.hostname !== "127.0.0.1"
) {
  throw new Error("PLAYWRIGHT_BASE_URL must be an HTTPS loopback URL.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ["--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      grepInvert: /runner signal-cleanup proof/,
      use: { ...devices["Pixel 5"] },
    },
  ],
});
