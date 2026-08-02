import { readFile } from "node:fs/promises";
import { createServer } from "node:https";

const [, , keyPath, certificatePath] = process.argv;
if (!keyPath || !certificatePath) {
  throw new Error("Direct API server requires a TLS key and certificate.");
}

const waitingOpenPlay = JSON.parse(
  await readFile(
    new URL(
      "../tests/fixtures/match-api-v1/server/waiting-open-play-response.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const apiHeaders = {
  "Content-Type": "application/json",
  "Match-API-Version": "1",
  "X-Request-Id": "request-direct-api-e2e",
};
const bearerCredential = "overgoal-direct-e2e-bearer";
const matchId = "match-direct-api-e2e";
const teams = [
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
];
let activeSubject = null;
let startedResponse = null;
let preflightCount = 0;

function corsOrigin(request) {
  const origin = request.headers.origin;
  return typeof origin === "string" &&
    /^https:\/\/127\.0\.0\.1:\d+$/u.test(origin)
    ? origin
    : null;
}

function responseHeaders(request, extra = {}) {
  const origin = corsOrigin(request);
  return {
    ...apiHeaders,
    ...(origin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Expose-Headers":
            "Match-API-Version, X-Request-Id, X-E2E-Preflight-Count",
          Vary: "Origin",
        }
      : {}),
    "X-E2E-Preflight-Count": String(preflightCount),
    ...extra,
  };
}

function send(request, response, status, body, extraHeaders = {}) {
  response.writeHead(status, responseHeaders(request, extraHeaders));
  response.end(body === null ? undefined : JSON.stringify(body));
}

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function authorized(request) {
  return (
    request.headers.authorization === `Bearer ${bearerCredential}` &&
    request.headers.cookie === undefined
  );
}

function sessionResponse() {
  return {
    session: {
      issued_at: "2026-07-19T12:00:00.000Z",
      idle_expires_at: "2026-07-19T12:15:00.000Z",
      absolute_expires_at: "2026-07-20T12:00:00.000Z",
      subject: activeSubject,
    },
    legend: { legend_id: "legend-direct-api-e2e" },
    response_context: { cookie_csrf_token: null },
    session_credential: bearerCredential,
  };
}

function createdMatch() {
  return {
    id: matchId,
    match: {
      id: matchId,
      my_team_id: teams[0].id,
      opponent_team_id: teams[1].id,
      my_team_score: 0,
      opponent_team_score: 0,
      current_time: 0,
      prev_time: 0,
      revision: 1,
      match_status: "NOT_STARTED",
      pending_action: null,
      event_counter: 0,
      seed: "direct-api-e2e-seed",
      engine_version: "match-engine/1",
      ruleset_version: "nss-match-v2/1",
      initial_state: {},
    },
    my_team: teams[0],
    opponent_team: teams[1],
  };
}

function startMatch() {
  const serialized = JSON.stringify(waitingOpenPlay).replaceAll(
    "match-fixture-1",
    matchId,
  );
  const result = JSON.parse(serialized);
  result.match.revision = 2;
  return result;
}

const server = createServer(
  {
    key: await readFile(keyPath),
    cert: await readFile(certificatePath),
  },
  async (request, response) => {
    const url = new URL(request.url ?? "/", "https://127.0.0.1");
    const origin = corsOrigin(request);
    if (!origin) {
      return send(request, response, 403, {
        error: "Origin is not allowed",
        code: "ORIGIN_FORBIDDEN",
      });
    }
    if (request.method === "OPTIONS") {
      preflightCount += 1;
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          request.headers["access-control-request-headers"] ?? "",
        "Access-Control-Max-Age": "60",
        Vary: "Origin, Access-Control-Request-Headers",
      });
      return response.end();
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/auth/v1/challenges"
    ) {
      const body = await jsonBody(request);
      activeSubject = {
        provider: "starknet",
        chain_id: body.chain_id,
        account_address: body.account_address,
      };
      return send(request, response, 201, {
        challenge_id: `0x${"1".repeat(32)}`,
        action: "CREATE_SESSION",
        ...activeSubject,
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
            chainId: activeSubject.chain_id,
            revision: "1",
          },
          message: { challenge_hash: "0x1" },
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/v1/sessions") {
      if (request.headers["overgoal-session-transport"] !== "bearer") {
        return send(request, response, 400, {
          error: "Bearer transport was not requested",
          code: "INVALID_SESSION_TRANSPORT",
        });
      }
      await jsonBody(request);
      return send(request, response, 201, sessionResponse());
    }
    if (
      request.method === "DELETE" &&
      url.pathname === "/api/auth/v1/session"
    ) {
      return authorized(request)
        ? send(request, response, 204, null)
        : send(request, response, 401, {
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
    }
    if (!authorized(request)) {
      return send(request, response, 401, {
        error: "A bearer credential is required",
        code: "UNAUTHORIZED",
      });
    }
    if (request.method === "GET" && url.pathname === "/api/teams") {
      return send(request, response, 200, { teams });
    }
    if (request.method === "POST" && url.pathname === "/api/createMatch") {
      if (!request.headers["idempotency-key"]) {
        return send(request, response, 400, {
          error: "Idempotency-Key is required",
          code: "INVALID_REQUEST",
        });
      }
      await jsonBody(request);
      return send(request, response, 201, createdMatch());
    }
    if (request.method === "POST" && url.pathname === "/api/startMatch") {
      if (
        !request.headers["idempotency-key"] ||
        request.headers["if-match-revision"] !== "1"
      ) {
        return send(request, response, 400, {
          error: "Command concurrency headers are required",
          code: "INVALID_REQUEST",
        });
      }
      await jsonBody(request);
      startedResponse ??= startMatch();
      return send(request, response, 200, startedResponse);
    }
    if (request.method === "GET" && url.pathname === `/api/match/${matchId}`) {
      const source = startedResponse ?? startMatch();
      return send(request, response, 200, {
        match: source.match,
        my_team: teams[0],
        opponent_team: teams[1],
        timeline: source.events,
        pending_action: source.pending_action,
        field_state: source.field_state,
      });
    }
    return send(request, response, 404, {
      error: "Resource not found",
      code: "RESOURCE_NOT_FOUND",
    });
  },
);

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Direct API did not receive a TCP address.");
  }
  console.log(`OVERGOAL_E2E_API_URL=https://127.0.0.1:${address.port}`);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
