import { expect, type Page } from "@playwright/test";
import { sepolia } from "@starknet-react/chains";

const encodedWallets = process.env.OVERGOAL_LOCAL_CI_WALLETS;

if (!encodedWallets) {
  throw new Error(
    "OVERGOAL_LOCAL_CI_WALLETS is required by authenticated E2E.",
  );
}

const [wallet] = JSON.parse(encodedWallets) as Array<{ address: string }>;
const walletChainId = `0x${sepolia.id.toString(16)}`;
const csrfToken = `0x${"a".repeat(64)}`;

function authChallengeResponse() {
  return {
    challenge_id: `0x${"1".repeat(32)}`,
    action: "CREATE_SESSION",
    account_address: wallet.address,
    chain_id: walletChainId,
    expires_at: "2030-07-19T12:05:00.000Z",
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
      issued_at: "2030-07-19T12:00:00.000Z",
      idle_expires_at: "2030-07-19T12:15:00.000Z",
      absolute_expires_at: "2030-07-20T12:00:00.000Z",
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

type AuthenticationEvidence = {
  challengeCalls: number;
  hydrationCalls: number;
  sessionCreationCalls: number;
};

export async function authenticateToHome(page: Page) {
  const context = page.context();
  const evidence: AuthenticationEvidence = {
    challengeCalls: 0,
    hydrationCalls: 0,
    sessionCreationCalls: 0,
  };
  await context.route("**/api/auth/v1/challenges", (route) => {
    evidence.challengeCalls += 1;
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(authChallengeResponse()),
    });
  });
  await context.route("**/api/auth/v1/sessions", (route) => {
    evidence.sessionCreationCalls += 1;
    route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: {
        "Set-Cookie":
          "__Host-overgoal_session=tactical-e2e; Path=/; Secure; HttpOnly; SameSite=Lax",
      },
      body: JSON.stringify(authSessionResponse()),
    });
  });
  await context.route("**/api/auth/v1/session", (route) => {
    evidence.hydrationCalls += 1;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authSessionResponse()),
    });
  });
  await context.route("**/api/processMatchAction", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe(csrfToken);
    await route.fallback();
  });

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
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/$/u);
  expect(evidence.challengeCalls).toBe(1);
  expect(evidence.sessionCreationCalls).toBe(1);
  expect(evidence.hydrationCalls).toBe(0);

  return evidence;
}

export async function authenticateForContinuation(page: Page) {
  const evidence = await authenticateToHome(page);
  await page.goto("/game");
  await expect(page).toHaveURL(/\/game$/u);
  await expect.poll(() => evidence.hydrationCalls).toBe(1);
  expect(evidence.challengeCalls).toBe(1);
  expect(evidence.sessionCreationCalls).toBe(1);
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
}
