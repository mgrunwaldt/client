import type { MatchCommand } from "./api-v1/adapter";
import type {
  BackendDecisionResult,
  BackendFieldState,
  BackendFullTimeHandoff,
  BackendHalftimeSummary,
  BackendLegendAvailabilityState,
  BackendMatch,
  BackendMatchOperationReceipt,
  BackendMatchResponse,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
  BackendUnsupportedSceneRecovery,
  KnownPlayableScene,
} from "./api-v1/contract";
import type { MatchApiResponseMetadata } from "./api-v1/errors";
import type { MatchRecoveryAction } from "./api-v1/errors";
import type {
  MatchFieldDraft,
  MatchResultReceiptIdentity,
} from "./session-recovery";

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
  | "unsupported_contract"
  | "unsupported_recovery";

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
  recoveryAction?: MatchRecoveryAction | null;
  metadata?: MatchApiResponseMetadata;
}

export interface MatchTransitionLoaderState {
  visible: boolean;
  title: string;
  subtitle: string;
  stage: string;
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
  retrySafe: boolean;
  fieldDraft: MatchFieldDraft | null;
  acknowledgedResult: MatchResultReceiptIdentity | null;
  decisionResult: BackendDecisionResult | null;
  resultPlayback: BackendMatchOperationReceipt | null;
  unsupportedScene: BackendUnsupportedSceneRecovery | null;
  legendAvailability: BackendLegendAvailabilityState | null;
  halftimeSummary: BackendHalftimeSummary | null;
  fullTimeHandoff: BackendFullTimeHandoff | null;
  latestOperation: BackendMatchOperationReceipt | null;
  diagnostic: MatchSessionDiagnostic | null;
  error: string | null;
}

export interface HydratedMatchSession {
  match: BackendMatch;
  myTeam: BackendTeam;
  opponentTeam: BackendTeam;
  timelineEvents: BackendTimelineEvent[];
  pendingAction?: BackendPendingAction | null;
  unsupportedScene?: BackendUnsupportedSceneRecovery | null;
  legendAvailability?: BackendLegendAvailabilityState;
  halftimeSummary?: BackendHalftimeSummary | null;
  fullTimeHandoff?: BackendFullTimeHandoff | null;
  latestOperation?: BackendMatchOperationReceipt | null;
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
  | { type: "COMMAND_RECONCILIATION_REQUIRED"; command: MatchCommand }
  | { type: "FIELD_DRAFT_RETAINED"; draft: MatchFieldDraft }
  | { type: "FIELD_DRAFT_CLEARED" }
  | { type: "START_REQUESTED"; command: MatchCommand }
  | { type: "RESUME_REQUESTED"; command: MatchCommand }
  | { type: "ACTION_REQUESTED"; command: MatchCommand }
  | { type: "HYDRATED"; payload: HydratedMatchSession }
  | {
      type: "COMMAND_RESOLVED";
      command: MatchCommand;
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
