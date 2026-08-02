import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const certificateSpki = process.env.OVERGOAL_E2E_CERTIFICATE_SPKI;

if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required; run browser tests with pnpm test:browser.",
  );
}

if (!certificateSpki) {
  throw new Error(
    "OVERGOAL_E2E_CERTIFICATE_SPKI is required; run browser tests with pnpm test:browser.",
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
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    contextOptions: {
      reducedMotion: "reduce",
    },
    launchOptions: {
      args: [
        "--enable-unsafe-swiftshader",
        `--ignore-certificate-errors-spki-list=${certificateSpki}`,
      ],
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
