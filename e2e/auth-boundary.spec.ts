import { expect, test } from "@playwright/test";
import { ec, typedData } from "starknet";

const accountAddress = "0x111";
const chainId = "0x534e";
const csrfToken = "csrf-e2e-token";
const challenge = {
  challenge_id: "challenge-e2e-1",
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
    message: { challenge_hash: "0x1" },
  },
};

test("authenticates a LOCAL_CI signer through normal challenge and session routes", async ({
  page,
}) => {
  const privateKey = ec.starkCurve.utils.randomPrivateKey();
  const publicKey = `0x${Buffer.from(ec.starkCurve.getPublicKey(privateKey)).toString("hex")}`;
  let sessionCreated = false;
  const calls: string[] = [];

  await page.route("**/api/auth/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${pathname}`);

    if (request.method() === "POST" && pathname === "/api/auth/v1/challenges") {
      const body = request.postDataJSON();
      expect(body).toEqual({
        action: "CREATE_SESSION",
        chain_id: chainId,
        account_address: accountAddress,
      });
      expect(request.headers()["x-test-user"]).toBeUndefined();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ challenge }),
      });
    }

    if (request.method() === "POST" && pathname === "/api/auth/v1/sessions") {
      const body = request.postDataJSON() as {
        proof: { challenge_id: string; signature: { r: string; s: string } };
      };
      const validSignature = typedData.verifyMessage(
        challenge.typed_data,
        [body.proof.signature.r, body.proof.signature.s],
        publicKey,
        accountAddress,
      );
      expect(body.proof.challenge_id).toBe(challenge.challenge_id);
      expect(validSignature).toBe(true);
      sessionCreated = true;
      return route.fulfill({
        status: 201,
        headers: {
          "Set-Cookie":
            "__Host-overgoal_session=server-only; Path=/; Secure; HttpOnly; SameSite=Lax",
        },
        contentType: "application/json",
        body: JSON.stringify({ session: { legend: { id: "legend-e2e" } } }),
      });
    }

    if (request.method() === "GET" && pathname === "/api/auth/v1/session") {
      expect(sessionCreated).toBe(true);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: { legend: { id: "legend-e2e" } },
          response_context: { cookie_csrf_token: csrfToken },
        }),
      });
    }

    return route.fulfill({ status: 404, body: "not found" });
  });

  await page.goto("/login");
  const signature = ec.starkCurve.sign(
    typedData.getMessageHash(challenge.typed_data, accountAddress),
    privateKey,
  );
  const proof = {
    challenge_id: challenge.challenge_id,
    signature: {
      r: `0x${signature.r.toString(16)}`,
      s: `0x${signature.s.toString(16)}`,
    },
  };

  const hydrated = await page.evaluate(
    async ({ authChallenge, authProof }) => {
      const issued = (await fetch("/api/auth/v1/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SESSION",
          chain_id: "0x534e",
          account_address: "0x111",
        }),
      }).then((response) => response.json())) as {
        challenge: { challenge_id: string };
      };
      if (issued.challenge.challenge_id !== authChallenge.challenge_id) {
        throw new Error("Unexpected auth challenge");
      }
      await fetch("/api/auth/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: authProof }),
      });
      return fetch("/api/auth/v1/session").then((response) => response.json());
    },
    { authChallenge: challenge, authProof: proof },
  );

  expect(hydrated).toEqual({
    session: { legend: { id: "legend-e2e" } },
    response_context: { cookie_csrf_token: csrfToken },
  });
  expect(calls).toEqual([
    "POST /api/auth/v1/challenges",
    "POST /api/auth/v1/sessions",
    "GET /api/auth/v1/session",
  ]);
});
