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

const BACKEND_BASE_URL = import.meta.env.VITE_MATCH_BACKEND_URL || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const data: unknown = await response.json();
  if (!response.ok) {
    const error =
      typeof data === "object" && data !== null && "error" in data
        ? data.error
        : null;
    throw new Error(
      typeof error === "string" ? error : `Backend request failed: ${path}`,
    );
  }

  return data as T;
}

export async function fetchBackendTeams(): Promise<BackendTeam[]> {
  const data = await request<{ teams: BackendTeam[] }>("/teams");
  return data.teams;
}

export async function createBackendMatch(body: {
  my_team_id: string;
  opponent_team_id: string;
  player_profile: Record<string, number>;
  ruleset?: Record<string, unknown>;
}): Promise<{
  id: string;
  match: BackendMatch;
  my_team: BackendTeam;
  opponent_team: BackendTeam;
}> {
  return request("/createMatch", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function startBackendMatch(
  matchId: string,
): Promise<BackendMatchResponse> {
  return request("/startMatch", {
    method: "POST",
    body: JSON.stringify({ match_id: matchId }),
  });
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
  matchId: string,
  matchDecision: Record<string, unknown>,
): Promise<BackendMatchResponse> {
  return request("/processMatchAction", {
    method: "POST",
    body: JSON.stringify({
      match_id: matchId,
      match_decision: matchDecision,
    }),
  });
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
