import { authenticatedRequestInit, matchApiBaseUrl } from "../auth/api";

export type BackendActionTeam = "MY_TEAM" | "OPPONENT_TEAM" | "NEUTRAL";

export interface BackendTeam {
  id: string;
  name: string;
  offense: number;
  defense: number;
  intensity: number;
  set_pieces?: number;
  chemistry?: number;
  formation?: string;
}

export interface BackendMatch {
  id: string;
  my_team_id: string;
  opponent_team_id: string;
  my_team_score: number;
  opponent_team_score: number;
  current_time: number;
  revision?: number;
  match_status: string;
  pending_action?: BackendPendingAction | null;
}

export interface BackendTimelineEvent {
  match_id: string;
  event_id: number;
  action: string;
  minute: number;
  team: BackendActionTeam;
  description: string;
  my_team_score: number;
  opponent_team_score: number;
  my_team_scored: boolean;
  opponent_team_scored: boolean;
  player_participates: boolean;
}

export interface BackendFieldPlayer {
  id: string;
  role: string;
  x: number;
  y: number;
  is_legend?: boolean;
  has_ball?: boolean;
  facing_target_x?: number;
  facing_target_y?: number;
}

export interface BackendFlightPoint {
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface BackendFieldState {
  id: string;
  match_id: string;
  minute: number;
  action_type: string;
  scene_family: string;
  my_team_positions: BackendFieldPlayer[];
  opponent_positions: BackendFieldPlayer[];
  legend_player_id?: string | null;
  carrier_player_id?: string | null;
  distance_to_goal: number;
  ball_x: number;
  ball_y: number;
  context?: Record<string, unknown>;
  dribble_pattern?: unknown;
}

export interface BackendPendingAction {
  id: string;
  minute: number;
  action_type: string;
  scene_type: string;
  action_team: BackendActionTeam;
  source: string;
  title: string;
  description: string;
  field_state_id: string;
  field_state?: BackendFieldState;
  available_choices: Array<{ id: string; label: string; description: string }>;
  context?: Record<string, unknown>;
  contract_version: number;
}

export interface BackendDecisionResult {
  description: string;
  success: boolean;
  outcome_type: string;
  flight_path?: BackendFlightPoint[];
  flight_outcome?: string;
  final_point?: BackendFlightPoint;
  receiver?: BackendFieldPlayer;
  interceptor?: BackendFieldPlayer;
}

export interface BackendMatchResponse {
  minute: number;
  status: string;
  prev_time: number;
  pending_action: BackendPendingAction | null;
  field_state: BackendFieldState | null;
  action: string | null;
  action_team: BackendActionTeam | null;
  events: BackendTimelineEvent[];
  match: BackendMatch;
  decision_result?: BackendDecisionResult;
}

export interface MatchCommand {
  operation: "create" | "start" | "resume" | "action";
  idempotencyKey: string;
  matchId: string;
  revision: number | null;
  actionId: string | null;
  payload: Record<string, unknown>;
}

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
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
  return revision as number;
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

async function request<T>(
  path: string,
  init?: RequestInit,
  unsafe = false,
): Promise<T> {
  const authenticatedInit = authenticatedRequestInit(init, unsafe);
  const headers = new Headers(authenticatedInit.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${matchApiBaseUrl()}${path}`, {
    ...authenticatedInit,
    headers,
  });

  const data: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = data as {
      error?: unknown;
      code?: unknown;
      retryable?: unknown;
    } | null;
    throw new BackendRequestError(
      typeof error?.error === "string"
        ? error.error
        : `Backend request failed: ${path}`,
      response.status,
      typeof error?.code === "string" ? error.code : null,
      error?.retryable === true,
    );
  }

  return data as T;
}

export async function fetchBackendTeams(): Promise<BackendTeam[]> {
  const data = await request<{ teams: BackendTeam[] }>("/teams");
  return data.teams;
}

export async function createBackendMatch(
  body: {
    my_team_id: string;
    opponent_team_id: string;
    player_profile: Record<string, number>;
    ruleset?: Record<string, unknown>;
  },
  command?: MatchCommand,
): Promise<{
  id: string;
  match: BackendMatch;
  my_team: BackendTeam;
  opponent_team: BackendTeam;
}> {
  const requestCommand = command || createMatchCommand("create", body);
  return request(
    "/createMatch",
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

export async function fetchBackendMatch(matchId: string): Promise<{
  match: BackendMatch;
  my_team: BackendTeam;
  opponent_team: BackendTeam;
  timeline: BackendTimelineEvent[];
}> {
  return request(`/match/${matchId}`);
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
    {
      method: "POST",
      headers: {
        "Idempotency-Key": requestCommand.idempotencyKey,
        "If-Match-Revision": String(requestCommand.revision),
      },
      body: JSON.stringify({
        ...requestCommand.payload,
      }),
    },
    true,
  );
}

export function defaultLegendProfile() {
  return {
    stamina: 78,
    energy: 78,
    shoot: 74,
    dribble: 76,
    speed: 77,
    passing: 73,
    heading: 69,
    defense: 58,
    intelligence: 72,
  };
}
