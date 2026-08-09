import { authenticatedRequestInit, matchApiBaseUrl } from "../../auth/api";
import { joinMatchApiPath } from "../../auth/api-config";
import {
  BackendCreateMatchResponseSchema,
  BackendErrorEnvelopeSchema,
  type BackendMatch,
  type BackendMatchResponse,
  BackendMatchResponseSchema,
  type BackendMatchSnapshot,
  BackendMatchSnapshotSchema,
  type BackendMatchTactics,
  type BackendTeam,
  BackendTeamListResponseSchema,
  MATCH_API_MAJOR_VERSION,
} from "./contract";
import {
  BackendRequestError,
  MATCH_RECOVERY_ACTIONS,
  MatchApiContractError,
  type MatchApiResponseMetadata,
} from "./errors";

export interface MatchCommand {
  operation: "create" | "start" | "resume" | "action" | "tactics";
  idempotencyKey: string;
  matchId: string;
  revision: number | null;
  actionId: string | null;
  payload: Record<string, unknown>;
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function requireRevision(match: BackendMatch) {
  const revision = match.revision;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    throw new Error("Match revision is required before submitting a command.");
  }
  return revision;
}

export function createMatchCommand(
  operation: MatchCommand["operation"],
  payload: Record<string, unknown>,
  options: {
    matchId?: string;
    revision?: number | null;
    actionId?: string | null;
    idempotencyKey?: string;
  } = {},
): MatchCommand {
  return {
    operation,
    idempotencyKey: options.idempotencyKey || newIdempotencyKey(),
    matchId: options.matchId || "",
    revision: options.revision ?? null,
    actionId: options.actionId ?? null,
    payload: structuredClone(payload),
  };
}

function responseMetadata(response: Response): MatchApiResponseMetadata {
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  return {
    apiVersion: response.headers.get("Match-API-Version"),
    requestId: response.headers.get("X-Request-Id"),
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? Math.max(0, retryAfterSeconds)
      : null,
  };
}

async function responseBody(
  response: Response,
  metadata: MatchApiResponseMetadata,
) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MatchApiContractError(
      "The match service returned invalid JSON.",
      metadata,
    );
  }
}

function assertApiVersion(metadata: MatchApiResponseMetadata) {
  if (metadata.apiVersion === MATCH_API_MAJOR_VERSION) return;
  throw new MatchApiContractError(
    `Unsupported Match API version ${metadata.apiVersion ?? "(missing)"}.`,
    metadata,
  );
}

async function request<T>(
  path: string,
  schema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: T;
      error?: Error;
    };
  },
  init?: RequestInit,
  unsafe = false,
): Promise<T> {
  const authenticatedInit = authenticatedRequestInit(init, unsafe);
  const headers = new Headers(authenticatedInit.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(joinMatchApiPath(matchApiBaseUrl(), path), {
    ...authenticatedInit,
    headers,
  });
  const metadata = responseMetadata(response);
  const data = await responseBody(response, metadata);
  assertApiVersion(metadata);

  if (!response.ok) {
    const parsedError = BackendErrorEnvelopeSchema.safeParse(data);
    if (!parsedError.success) {
      throw new MatchApiContractError(
        `The match service returned an invalid error response for ${path}.`,
        metadata,
        parsedError.error.message,
      );
    }
    throw new BackendRequestError(
      parsedError.data.error,
      response.status,
      parsedError.data.code ?? null,
      parsedError.data.retryable === true ||
        response.status >= 500 ||
        response.status === 429,
      MATCH_RECOVERY_ACTIONS.includes(
        parsedError.data
          .recovery_action as (typeof MATCH_RECOVERY_ACTIONS)[number],
      )
        ? parsedError.data.recovery_action
        : null,
      metadata,
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success || parsed.data === undefined) {
    throw new MatchApiContractError(
      `The match service returned an invalid success response for ${path}.`,
      metadata,
      parsed.error?.message ?? null,
    );
  }
  return parsed.data;
}

export async function fetchBackendTeams(): Promise<BackendTeam[]> {
  const response = await request("/teams", BackendTeamListResponseSchema);
  return response.teams;
}

export async function createBackendMatch(
  body: {
    my_team_id: string;
    opponent_team_id: string;
    player_profile: Record<string, number>;
    ruleset?: Record<string, unknown>;
  },
  command?: MatchCommand,
) {
  const requestCommand = command || createMatchCommand("create", body);
  return request(
    "/createMatch",
    BackendCreateMatchResponseSchema,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestCommand.idempotencyKey },
      body: JSON.stringify(requestCommand.payload),
    },
    true,
  );
}

export async function resumeBackendMatch(
  match: BackendMatch,
  command?: MatchCommand,
): Promise<BackendMatchResponse> {
  const requestCommand =
    command ||
    createMatchCommand(
      "resume",
      { match_id: match.id },
      { matchId: match.id, revision: requireRevision(match) },
    );
  if (requestCommand.revision === null) {
    throw new Error("Match revision is required before submitting a command.");
  }
  return request(
    "/resumeMatch",
    BackendMatchResponseSchema,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": requestCommand.idempotencyKey,
        "If-Match-Revision": String(requestCommand.revision),
      },
      body: JSON.stringify(requestCommand.payload),
    },
    true,
  );
}

export async function startBackendMatch(
  match: BackendMatch,
  command?: MatchCommand,
): Promise<BackendMatchResponse> {
  const requestCommand =
    command ||
    createMatchCommand(
      "start",
      { match_id: match.id },
      { matchId: match.id, revision: requireRevision(match) },
    );
  if (requestCommand.revision === null) {
    throw new Error("Match revision is required before submitting a command.");
  }
  return request(
    "/startMatch",
    BackendMatchResponseSchema,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": requestCommand.idempotencyKey,
        "If-Match-Revision": String(requestCommand.revision),
      },
      body: JSON.stringify(requestCommand.payload),
    },
    true,
  );
}

export async function fetchBackendMatch(
  matchId: string,
): Promise<BackendMatchSnapshot> {
  const snapshot = await request(
    `/match/${matchId}`,
    BackendMatchSnapshotSchema,
  );
  if (snapshot.match.id !== matchId) {
    throw new MatchApiContractError(
      `The match service returned match ${snapshot.match.id} for requested match ${matchId}.`,
      {
        apiVersion: MATCH_API_MAJOR_VERSION,
        requestId: null,
        retryAfterSeconds: null,
      },
    );
  }
  return snapshot;
}

export async function updateBackendMatchTactics(
  match: BackendMatch,
  tactics: BackendMatchTactics,
  command?: MatchCommand,
): Promise<BackendMatchSnapshot> {
  const requestCommand =
    command ||
    createMatchCommand(
      "tactics",
      { ...tactics },
      {
        matchId: match.id,
        revision: requireRevision(match),
      },
    );
  if (requestCommand.revision === null) {
    throw new Error("Match revision is required before updating tactics.");
  }
  const snapshot = await request(
    `/match/${match.id}/tactics`,
    BackendMatchSnapshotSchema,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": requestCommand.idempotencyKey,
        "If-Match-Revision": String(requestCommand.revision),
      },
      body: JSON.stringify(requestCommand.payload),
    },
    true,
  );
  if (snapshot.match.id !== match.id) {
    throw new MatchApiContractError(
      `The tactics response returned match ${snapshot.match.id} for requested match ${match.id}.`,
      {
        apiVersion: MATCH_API_MAJOR_VERSION,
        requestId: null,
        retryAfterSeconds: null,
      },
    );
  }
  return snapshot;
}

export async function processBackendMatchAction(
  match: BackendMatch,
  actionId: string,
  matchDecision: Record<string, unknown>,
  command?: MatchCommand,
): Promise<BackendMatchResponse> {
  const requestCommand =
    command ||
    createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: actionId,
        match_decision: matchDecision,
      },
      {
        matchId: match.id,
        revision: requireRevision(match),
        actionId,
      },
    );
  if (requestCommand.revision === null) {
    throw new Error("Match revision is required before submitting a command.");
  }
  return request(
    "/processMatchAction",
    BackendMatchResponseSchema,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": requestCommand.idempotencyKey,
        "If-Match-Revision": String(requestCommand.revision),
      },
      body: JSON.stringify(requestCommand.payload),
    },
    true,
  );
}
