import { expect, test } from "@playwright/test";
import { sepolia } from "@starknet-react/chains";
import { typedData } from "starknet";

interface LocalCiWallet {
  address: string;
  privateKey: string;
  publicKey: string;
}

declare global {
  var __OVERGOAL_E2E_SWITCH_LOCAL_CI_WALLET__:
    | ((accountIndex: number) => string)
    | undefined;
}

const encodedWallets = process.env.OVERGOAL_LOCAL_CI_WALLETS;
if (!encodedWallets) {
  throw new Error("OVERGOAL_LOCAL_CI_WALLETS is required by auth E2E.");
}
const wallets = JSON.parse(encodedWallets) as LocalCiWallet[];
const chainId = `0x${sepolia.id.toString(16)}`;
const csrfToken = "0x" + "c".repeat(64);
const cookieName = "__Host-overgoal_session";

function sessionResponse(accountAddress: string, csrf: string | null) {
  return {
    session: {
      issued_at: "2026-07-19T12:00:00.000Z",
      idle_expires_at: "2026-07-19T12:15:00.000Z",
      absolute_expires_at: "2026-07-20T12:00:00.000Z",
      subject: {
        provider: "starknet",
        chain_id: chainId,
        account_address: accountAddress,
      },
    },
    legend: { legend_id: `legend-${accountAddress.slice(-8)}` },
    response_context: { cookie_csrf_token: csrf },
  };
}

function challengeFor(accountAddress: string, sequence: number) {
  return {
    challenge_id: `0x${sequence.toString(16).padStart(32, "0")}`,
    action: "CREATE_SESSION" as const,
    account_address: accountAddress,
    chain_id: chainId,
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
        chainId,
        revision: "1",
      },
      message: { challenge_hash: `0x${sequence.toString(16)}` },
    },
  };
}

test("uses the real LOCAL_CI wallet, cookie hydration, CSRF, switch, and logout paths", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  let activeAddress: string | null = null;
  let challengeSequence = 0;
  let hydrated = false;
  let createMatchCalls = 0;
  let startMatchCalls = 0;
  let logoutCalls = 0;
  const issuedChallenges = new Map<string, ReturnType<typeof challengeFor>>();
  const calls: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    calls.push(`${request.method()} ${pathname}`);

    if (request.method() === "POST" && pathname === "/api/auth/v1/challenges") {
      const body = request.postDataJSON() as {
        action: string;
        chain_id: string;
        account_address: string;
      };
      expect(body).toEqual({
        action: "CREATE_SESSION",
        chain_id: chainId,
        account_address: body.account_address,
      });
      expect(wallets.map(({ address }) => address)).toContain(
        body.account_address,
      );
      expect(request.headers()["x-test-user"]).toBeUndefined();
      const challenge = challengeFor(body.account_address, ++challengeSequence);
      issuedChallenges.set(challenge.challenge_id, challenge);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(challenge),
      });
    }

    if (request.method() === "POST" && pathname === "/api/auth/v1/sessions") {
      const body = request.postDataJSON() as {
        challenge_id: string;
        signature: { r: string; s: string };
      };
      expect(Object.keys(body).sort()).toEqual(["challenge_id", "signature"]);
      const challenge = issuedChallenges.get(body.challenge_id);
      expect(challenge).toBeDefined();
      expect(
        typedData.verifyMessage(
          challenge!.typed_data,
          [body.signature.r, body.signature.s],
          wallets.find(({ address }) => address === challenge!.account_address)!
            .publicKey,
          challenge!.account_address,
        ),
      ).toBe(true);
      activeAddress = challenge!.account_address;
      return route.fulfill({
        status: 201,
        headers: {
          "Set-Cookie": `${cookieName}=session-${challengeSequence}; Path=/; Secure; HttpOnly; SameSite=Lax`,
        },
        contentType: "application/json",
        body: JSON.stringify(sessionResponse(activeAddress, csrfToken)),
      });
    }

    if (request.method() === "GET" && pathname === "/api/auth/v1/session") {
      expect((await request.allHeaders()).cookie).toContain(`${cookieName}=`);
      expect(activeAddress).not.toBeNull();
      hydrated = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionResponse(activeAddress!, csrfToken)),
      });
    }

    if (request.method() === "DELETE" && pathname === "/api/auth/v1/session") {
      logoutCalls += 1;
      activeAddress = null;
      return route.fulfill({
        status: 204,
        headers: {
          "Set-Cookie": `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    if (request.method() === "GET" && pathname === "/api/teams") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          teams: [
            {
              id: "team-1",
              name: "Dojo United",
              offense: 80,
              defense: 75,
              intensity: 70,
            },
            {
              id: "team-2",
              name: "Cartridge City",
              offense: 76,
              defense: 74,
              intensity: 72,
            },
          ],
        }),
      });
    }

    if (request.method() === "POST" && pathname === "/api/createMatch") {
      createMatchCalls += 1;
      expect(hydrated).toBe(true);
      expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
      expect(request.headers().origin).toBe(url.origin);
      expect(request.headers()["idempotency-key"]).toBeTruthy();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "match-owner-a",
          match: {
            id: "match-owner-a",
            my_team_id: "team-1",
            opponent_team_id: "team-2",
            my_team_score: 0,
            opponent_team_score: 0,
            current_time: 0,
            revision: 1,
            match_status: "NOT_STARTED",
          },
          my_team: {
            id: "team-1",
            name: "Dojo United",
            offense: 80,
            defense: 75,
            intensity: 70,
          },
          opponent_team: {
            id: "team-2",
            name: "Cartridge City",
            offense: 76,
            defense: 74,
            intensity: 72,
          },
        }),
      });
    }

    if (request.method() === "GET" && pathname === "/api/match/match-owner-a") {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Match not found", code: "NOT_FOUND" }),
      });
    }

    if (request.method() === "POST" && pathname === "/api/startMatch") {
      startMatchCalls += 1;
    }
    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Connect Controller" }).click();
  await expect(page).toHaveURL(/\/post-login-screen$/u);

  const cookiesAfterLogin = await context.cookies();
  expect(cookiesAfterLogin).toContainEqual(
    expect.objectContaining({
      name: cookieName,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    }),
  );

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.locator('a[href="/settings"]').click();
  await expect(page).toHaveURL(/\/settings$/u);
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  const sessionsBeforeRefresh = challengeSequence;
  await page.reload();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  expect(challengeSequence).toBe(sessionsBeforeRefresh);

  await page.locator("button").first().click();
  await expect(page).toHaveURL(/\/$/u);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/pre-match\/match-owner-a$/u);
  expect(createMatchCalls).toBe(1);

  const switchedAddress = await page.evaluate(() =>
    globalThis.__OVERGOAL_E2E_SWITCH_LOCAL_CI_WALLET__?.(1),
  );
  expect(switchedAddress).toBe(wallets[1].address);
  await expect.poll(() => logoutCalls).toBe(1);
  await expect.poll(() => challengeSequence).toBe(sessionsBeforeRefresh + 1);
  await page.getByRole("button", { name: "Play" }).click();
  expect(startMatchCalls).toBe(0);

  await page.locator("button").first().click();
  await page.locator('a[href="/settings"]').click();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect.poll(() => logoutCalls).toBe(2);
  expect(calls).not.toContain("POST /api/startMatch");
});
