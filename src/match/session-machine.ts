import {
  type BackendMatch,
  type BackendMatchResponse,
  type BackendPendingAction,
  type BackendTimelineEvent,
  isKnownMatchStatus,
  isKnownPlayableScene,
} from "./api-v1/contract";
import type {
  HydratedMatchSession,
  MatchPlaybackStatus,
  MatchSessionData,
  MatchSessionDiagnostic,
  MatchSessionEvent,
  MatchSessionPhase,
  MatchSessionRoute,
} from "./session-types";

export const SCENE_SUPPORT = {
  OPEN_PLAY: ["KICK", "DRIBBLE"],
  DRIBBLE: ["DRIBBLE_RUN", "SIMULATE_FOUL"],
  FREE_KICK: ["KICK"],
  CORNER: ["KICK"],
  PENALTY: ["KICK"],
  JUMPER: ["ACCEPT_HUG", "DODGE", "SECURITY_TACKLE"],
  BRAWL: ["JOIN_IN", "PULL_AWAY", "STAY_OUT"],
  ARGUMENT_OPPONENT: ["TRASH_TALK", "WALK_AWAY", "HEADBUTT"],
  ARGUMENT_TEAMMATE: ["SHOUT_BACK", "CALM_DOWN", "IGNORE"],
  BATHROOM: ["ASK_FOR_SUB", "HOLD_IT", "BEHIND_BOARDS"],
} as const;

const initialData: MatchSessionData = {
  phase: "idle",
  route: "main",
  match: null,
  myTeam: null,
  opponentTeam: null,
  pendingAction: null,
  fieldState: null,
  timelineEvents: [],
  playbackMinute: 0,
  playbackStatus: "idle",
  effort: "medium",
  playstyle: "balanced",
  pendingCommand: null,
  decisionResult: null,
  diagnostic: null,
  error: null,
};

export function createInitialMatchSession(): MatchSessionData {
  return { ...initialData };
}

function mergeTimelineEvents(
  existing: BackendTimelineEvent[],
  incoming: BackendTimelineEvent[],
) {
  const merged = new Map<string, BackendTimelineEvent>();
  for (const event of [...existing, ...incoming]) {
    merged.set(`${event.match_id}_${event.event_id}`, event);
  }
  return Array.from(merged.values()).sort(
    (left, right) => left.event_id - right.event_id,
  );
}

function routeForPhase(phase: MatchSessionPhase): MatchSessionRoute {
  switch (phase) {
    case "created":
    case "starting":
      return "prematch";
    case "scene_ready":
    case "submitting":
    case "result_playback":
      return "field";
    case "timeline_playback":
    case "halftime":
    case "finished":
    case "legend_unavailable_simulation":
      return "timeline";
    default:
      return "main";
  }
}

function playbackStatusForPhase(phase: MatchSessionPhase): MatchPlaybackStatus {
  switch (phase) {
    case "created":
      return "created";
    case "timeline_playback":
      return "timeline_playing";
    case "scene_ready":
    case "submitting":
    case "result_playback":
      return "field_ready";
    default:
      return "idle";
  }
}

function withPhase(
  state: MatchSessionData,
  phase: MatchSessionPhase,
): MatchSessionData {
  return {
    ...state,
    phase,
    route: routeForPhase(phase),
    playbackStatus: playbackStatusForPhase(phase),
  };
}

function diagnosticState(
  state: MatchSessionData,
  diagnostic: MatchSessionDiagnostic,
  phase: MatchSessionPhase = "recoverable_error",
) {
  return withPhase(
    {
      ...state,
      diagnostic,
      error: diagnostic.message,
    },
    phase,
  );
}

function unsupportedStatus(state: MatchSessionData, status: string) {
  return diagnosticState(
    state,
    {
      kind: "unsupported_status",
      message: `The match service returned unsupported status ${status}.`,
      retryable: true,
    },
    "unsupported_contract",
  );
}

function unsupportedScene(state: MatchSessionData, scene: string) {
  return diagnosticState(
    state,
    {
      kind: "unsupported_scene",
      message: `The match service returned unsupported scene ${scene}.`,
      retryable: true,
    },
    "unsupported_contract",
  );
}

function commandMatchesCurrentScene(
  pending: BackendPendingAction | null,
  command: MatchSessionData["pendingCommand"],
) {
  return Boolean(
    pending &&
      command &&
      command.operation === "action" &&
      command.matchId === pending.field_state?.match_id &&
      command.actionId === pending.id,
  );
}

function phaseForMatch(
  match: BackendMatch,
  pendingAction: BackendPendingAction | null,
) {
  if (!isKnownMatchStatus(match.match_status)) return null;
  switch (match.match_status) {
    case "NOT_STARTED":
      return "created" as const;
    case "IN_PROGRESS":
      return match.player_participation === "NOT_PARTICIPATING"
        ? ("legend_unavailable_simulation" as const)
        : ("timeline_playback" as const);
    case "WAITING_FOR_DECISION":
      return pendingAction ? ("timeline_playback" as const) : null;
    case "HALFTIME":
      return "halftime" as const;
    case "FINISHED":
      return "finished" as const;
  }
}

function applyAuthoritativeSnapshot(
  state: MatchSessionData,
  payload: HydratedMatchSession,
  options: {
    preservePlayback: boolean;
    resultPlayback: boolean;
    playbackMinute?: number;
  },
): MatchSessionData {
  const pendingAction =
    payload.pendingAction === undefined
      ? (payload.match.pending_action ?? null)
      : payload.pendingAction;
  const match =
    payload.match.pending_action === pendingAction
      ? payload.match
      : { ...payload.match, pending_action: pendingAction };
  const phase = phaseForMatch(match, pendingAction);
  if (!phase) {
    return pendingAction
      ? unsupportedStatus(state, match.match_status)
      : diagnosticState(state, {
          kind: "contract",
          message: "WAITING_FOR_DECISION requires a pending action.",
          retryable: true,
        });
  }
  if (pendingAction && !isKnownPlayableScene(pendingAction.scene_type)) {
    return unsupportedScene(state, pendingAction.scene_type);
  }
  const sameMatch = state.match?.id === match.id;
  const preservePlayback =
    options.preservePlayback &&
    sameMatch &&
    state.phase === "timeline_playback" &&
    phase === "timeline_playback";
  const nextPhase = options.resultPlayback ? "result_playback" : phase;
  const fieldState = pendingAction?.field_state ?? null;
  const pendingCommand = commandMatchesCurrentScene(
    pendingAction,
    state.pendingCommand,
  )
    ? state.pendingCommand
    : null;
  return withPhase(
    {
      ...state,
      match,
      myTeam: payload.myTeam,
      opponentTeam: payload.opponentTeam,
      pendingAction,
      fieldState,
      timelineEvents: mergeTimelineEvents(
        sameMatch ? state.timelineEvents : [],
        payload.timelineEvents,
      ),
      playbackMinute: preservePlayback
        ? state.playbackMinute
        : (options.playbackMinute ??
          (phase === "timeline_playback"
            ? (payload.match.prev_time ?? 0)
            : payload.match.current_time)),
      pendingCommand,
      decisionResult: options.resultPlayback ? state.decisionResult : null,
      diagnostic: null,
      error: null,
    },
    nextPhase,
  );
}

function responsePayload(
  state: MatchSessionData,
  response: BackendMatchResponse,
): HydratedMatchSession | null {
  if (!state.myTeam || !state.opponentTeam) return null;
  return {
    match: response.match,
    myTeam: state.myTeam,
    opponentTeam: state.opponentTeam,
    timelineEvents: response.events,
    pendingAction: response.pending_action,
  };
}

function responseIsStale(
  state: MatchSessionData,
  response: BackendMatchResponse,
) {
  if (!state.match) return false;
  if (response.match.id !== state.match.id) return true;
  const currentRevision = state.match.revision;
  const incomingRevision = response.match.revision;
  return (
    typeof currentRevision === "number" &&
    typeof incomingRevision === "number" &&
    incomingRevision < currentRevision
  );
}

export function matchSessionReducer(
  state: MatchSessionData,
  event: MatchSessionEvent,
): MatchSessionData {
  switch (event.type) {
    case "RESET":
      return createInitialMatchSession();
    case "CREATE_REQUESTED":
      return withPhase(
        {
          ...state,
          pendingCommand: event.command ?? null,
          diagnostic: null,
          error: null,
        },
        "creating",
      );
    case "MATCH_CREATED": {
      if (!isKnownMatchStatus(event.payload.match.match_status)) {
        return unsupportedStatus(state, event.payload.match.match_status);
      }
      if (event.payload.match.match_status !== "NOT_STARTED") {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A created match must be in NOT_STARTED state.",
          retryable: true,
        });
      }
      return withPhase(
        {
          ...state,
          ...event.payload,
          pendingAction: null,
          fieldState: null,
          timelineEvents: [],
          playbackMinute: 0,
          pendingCommand: null,
          decisionResult: null,
          diagnostic: null,
          error: null,
        },
        "created",
      );
    }
    case "COMMAND_RETAINED": {
      const current = state.pendingCommand;
      if (current?.idempotencyKey === event.command.idempotencyKey)
        return state;
      if (current) {
        return diagnosticState(state, {
          kind: "duplicate_command",
          message: "Another match command is already pending.",
          retryable: true,
        });
      }
      return { ...state, pendingCommand: event.command };
    }
    case "COMMAND_CLEARED":
      return { ...state, pendingCommand: null };
    case "START_REQUESTED":
      if (state.phase !== "created") {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A match can only start from the prematch state.",
          retryable: true,
        });
      }
      return withPhase({ ...state, pendingCommand: event.command }, "starting");
    case "ACTION_REQUESTED":
      if (state.phase !== "scene_ready") {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A scene can only be submitted when it is ready.",
          retryable: true,
        });
      }
      if (event.command.actionId !== state.pendingAction?.id) {
        return diagnosticState(state, {
          kind: "stale_command",
          message: "The submitted action no longer matches the active scene.",
          retryable: true,
        });
      }
      return withPhase(
        { ...state, pendingCommand: event.command },
        "submitting",
      );
    case "HYDRATED":
      return applyAuthoritativeSnapshot(state, event.payload, {
        preservePlayback: true,
        resultPlayback: false,
      });
    case "COMMAND_RESOLVED": {
      if (responseIsStale(state, event.response)) {
        return diagnosticState(state, {
          kind: "stale_command",
          message: "An outdated match response was ignored.",
          retryable: true,
        });
      }
      if (event.response.status !== event.response.match.match_status) {
        return diagnosticState(state, {
          kind: "contract",
          message:
            "The response status does not match the authoritative match status.",
          retryable: true,
        });
      }
      const payload = responsePayload(state, event.response);
      if (!payload) {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A command response requires hydrated team context.",
          retryable: true,
        });
      }
      const resultPlayback = event.source === "action";
      const next = applyAuthoritativeSnapshot(state, payload, {
        preservePlayback: false,
        resultPlayback,
        playbackMinute: event.response.prev_time,
      });
      return {
        ...next,
        pendingCommand: null,
        decisionResult: resultPlayback
          ? (event.response.decision_result ?? null)
          : null,
      };
    }
    case "TIMELINE_TICK": {
      if (state.phase !== "timeline_playback" || !state.match) return state;
      const target = state.pendingAction?.minute ?? state.match.current_time;
      const minute = Math.min(
        target,
        Math.max(state.playbackMinute, event.minute),
      );
      return { ...state, playbackMinute: minute };
    }
    case "SCENE_READY":
      if (
        state.phase !== "timeline_playback" ||
        !state.pendingAction ||
        state.playbackMinute < state.pendingAction.minute
      ) {
        return state;
      }
      return withPhase(state, "scene_ready");
    case "RESULT_ACKNOWLEDGED": {
      if (state.phase !== "result_playback" || !state.match) return state;
      const phase = phaseForMatch(state.match, state.pendingAction);
      if (!phase) return unsupportedStatus(state, state.match.match_status);
      return withPhase({ ...state, decisionResult: null }, phase);
    }
    case "ERROR_RECORDED":
      return diagnosticState(state, event.diagnostic);
    case "ERROR_CLEARED":
      if (state.phase !== "recoverable_error")
        return { ...state, diagnostic: null, error: null };
      if (!state.match) return createInitialMatchSession();
      return withPhase(
        { ...state, diagnostic: null, error: null },
        "timeline_playback",
      );
    case "EFFORT_CHANGED":
      return { ...state, effort: event.effort };
    case "PLAYSTYLE_CHANGED":
      return { ...state, playstyle: event.playstyle };
  }
}

export function stateForScene(scene: string) {
  return isKnownPlayableScene(scene) ? "scene_ready" : "unsupported_contract";
}
