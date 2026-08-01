import type { MatchCommand } from "./api-v1/adapter";
import type {
  BackendDecisionResult,
  BackendFieldState,
  BackendMatch,
  BackendMatchResponse,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
  KnownPlayableScene,
} from "./api-v1/contract";
import type { MatchApiResponseMetadata } from "./api-v1/errors";

export type EffortLevel = "low" | "medium" | "high";
export type Playstyle = "defense" | "balanced" | "offensive";

export type MatchSessionPhase =
  | "idle"
  | "creating"
  | "created"
  | "starting"
  | "resuming"
  | "timeline_playback"
  | "scene_ready"
  | "submitting"
  | "result_playback"
  | "halftime"
  | "finished"
  | "legend_unavailable_simulation"
  | "recoverable_error"
  | "unsupported_contract";

export type MatchSessionRoute = "main" | "prematch" | "timeline" | "field";

export type MatchPlaybackStatus =
  | "idle"
  | "created"
  | "timeline_playing"
  | "timeline_ready_for_field"
  | "field_ready";

export interface MatchSessionDiagnostic {
  kind:
    | "network"
    | "contract"
    | "stale_command"
    | "duplicate_command"
    | "illegal_transition"
    | "unsupported_status"
    | "unsupported_scene";
  message: string;
  retryable: boolean;
  status?: number;
  code?: string | null;
  metadata?: MatchApiResponseMetadata;
}

export interface MatchTransitionLoaderState {
  visible: boolean;
  title: string;
  subtitle: string;
  progress: number;
}

export interface MatchSessionData {
  phase: MatchSessionPhase;
  recoveryPhase: MatchSessionPhase | null;
  route: MatchSessionRoute;
  match: BackendMatch | null;
  myTeam: BackendTeam | null;
  opponentTeam: BackendTeam | null;
  pendingAction: BackendPendingAction | null;
  fieldState: BackendFieldState | null;
  timelineEvents: BackendTimelineEvent[];
  playbackMinute: number;
  playbackStatus: MatchPlaybackStatus;
  effort: EffortLevel;
  playstyle: Playstyle;
  pendingCommand: MatchCommand | null;
  decisionResult: BackendDecisionResult | null;
  diagnostic: MatchSessionDiagnostic | null;
  error: string | null;
}

export interface HydratedMatchSession {
  match: BackendMatch;
  myTeam: BackendTeam;
  opponentTeam: BackendTeam;
  timelineEvents: BackendTimelineEvent[];
  pendingAction?: BackendPendingAction | null;
}

export type MatchSessionEvent =
  | { type: "RESET" }
  | { type: "CREATE_REQUESTED"; command: MatchCommand }
  | {
      type: "MATCH_CREATED";
      payload: {
        match: BackendMatch;
        myTeam: BackendTeam;
        opponentTeam: BackendTeam;
      };
    }
  | { type: "COMMAND_RETAINED"; command: MatchCommand }
  | { type: "COMMAND_CLEARED" }
  | { type: "START_REQUESTED"; command: MatchCommand }
  | { type: "RESUME_REQUESTED"; command: MatchCommand }
  | { type: "ACTION_REQUESTED"; command: MatchCommand }
  | { type: "HYDRATED"; payload: HydratedMatchSession }
  | {
      type: "COMMAND_RESOLVED";
      response: BackendMatchResponse;
      source: "start" | "resume" | "action";
    }
  | { type: "TIMELINE_TICK"; minute: number }
  | { type: "SCENE_READY" }
  | { type: "RESULT_ACKNOWLEDGED" }
  | { type: "ERROR_RECORDED"; diagnostic: MatchSessionDiagnostic }
  | { type: "ERROR_CLEARED" }
  | { type: "EFFORT_CHANGED"; effort: EffortLevel }
  | { type: "PLAYSTYLE_CHANGED"; playstyle: Playstyle };

export interface SceneSupport {
  scene: KnownPlayableScene;
  availableChoices: readonly string[];
}
