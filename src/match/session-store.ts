import { create } from "zustand";

import type { MatchCommand } from "./api-v1/adapter";
import type {
  BackendMatch,
  BackendMatchResponse,
  BackendTeam,
} from "./api-v1/contract";
import { BackendRequestError, MatchApiContractError } from "./api-v1/errors";
import {
  createInitialMatchSession,
  matchSessionReducer,
} from "./session-machine";
import {
  matchCommandsExactly,
  type MatchFieldDraft,
  readMatchRecoveryJournal,
  writeMatchRecoveryJournal,
} from "./session-recovery";
import type {
  EffortLevel,
  HydratedMatchSession,
  MatchSessionData,
  MatchSessionDiagnostic,
  MatchTransitionLoaderState,
  Playstyle,
} from "./session-types";

export type {
  EffortLevel,
  MatchPlaybackStatus,
  MatchSessionData,
  MatchSessionDiagnostic,
  MatchSessionPhase,
  MatchSessionRoute,
  Playstyle,
} from "./session-types";

interface MatchSessionActions {
  resetMatchSession: () => void;
  beginCreateCommand: (command: MatchCommand) => boolean;
  setLoading: (loading: boolean) => void;
  beginHydrationLoading: () => number;
  finishHydrationLoading: (generation: number) => void;
  setError: (error: unknown | null) => void;
  retainPendingCommand: (command: MatchCommand) => void;
  clearPendingCommand: () => void;
  requireCommandReconciliation: (command: MatchCommand) => void;
  retainFieldDraft: (draft: MatchFieldDraft) => void;
  clearFieldDraft: () => void;
  showTransitionLoader: (payload: Partial<MatchTransitionLoaderState>) => void;
  updateTransitionLoader: (
    payload: Partial<MatchTransitionLoaderState>,
  ) => void;
  hideTransitionLoader: () => void;
  setCreatedMatch: (payload: {
    match: BackendMatch;
    myTeam: BackendTeam;
    opponentTeam: BackendTeam;
  }) => void;
  beginStartCommand: (command: MatchCommand) => boolean;
  beginResumeCommand: (command: MatchCommand) => boolean;
  beginActionCommand: (command: MatchCommand) => boolean;
  setStartResponse: (
    response: BackendMatchResponse,
    command: MatchCommand,
  ) => boolean;
  setResumeResponse: (
    response: BackendMatchResponse,
    command: MatchCommand,
  ) => boolean;
  setActionResponse: (
    response: BackendMatchResponse,
    command: MatchCommand,
  ) => boolean;
  acknowledgeDecisionResult: () => void;
  hydrateMatchSession: (payload: HydratedMatchSession) => void;
  setPlaybackMinute: (minute: number) => void;
  markSceneReady: () => void;
  setEffort: (effort: EffortLevel) => void;
  setPlaystyle: (playstyle: Playstyle) => void;
}

interface MatchSessionUiState {
  loading: boolean;
  loadingGeneration: number;
  transitionLoader: MatchTransitionLoaderState;
}

type MatchSessionStore = MatchSessionData &
  MatchSessionUiState &
  MatchSessionActions;

const initialUiState: MatchSessionUiState = {
  loading: false,
  loadingGeneration: 0,
  transitionLoader: {
    visible: false,
    title: "Loading",
    subtitle: "",
    stage: "Preparing match",
    progress: 0,
  },
};

function initialSessionState() {
  const journal = readMatchRecoveryJournal();
  return {
    ...createInitialMatchSession(),
    pendingCommand: journal.pendingCommand,
    fieldDraft: journal.fieldDraft,
    acknowledgedResult: journal.acknowledgedResult,
  };
}

function persistRecoveryJournal(state: MatchSessionData) {
  writeMatchRecoveryJournal({
    version: 1,
    pendingCommand: state.pendingCommand,
    fieldDraft: state.fieldDraft,
    acknowledgedResult: state.acknowledgedResult,
  });
}

function loadingForPhase(phase: MatchSessionData["phase"]) {
  return (
    phase === "creating" ||
    phase === "starting" ||
    phase === "resuming" ||
    phase === "submitting"
  );
}

function updateSession(
  set: (
    partial:
      | Partial<MatchSessionStore>
      | ((state: MatchSessionStore) => Partial<MatchSessionStore>),
  ) => void,
  event: Parameters<typeof matchSessionReducer>[1],
) {
  let result: MatchSessionData | null = null;
  set((state) => {
    const next = matchSessionReducer(state, event);
    result = next;
    return {
      ...next,
      loading: loadingForPhase(next.phase),
      // A reducer transition supersedes a screen-owned hydration loader.
      loadingGeneration: state.loadingGeneration + 1,
    };
  });
  if (!result) throw new Error("The match session transition did not run.");
  persistRecoveryJournal(result);
  return result;
}

function commandAccepted(
  state: MatchSessionData,
  command: MatchCommand,
  phase: MatchSessionData["phase"],
) {
  return (
    state.phase === phase &&
    state.pendingCommand?.idempotencyKey === command.idempotencyKey
  );
}

function responseAccepted(
  state: MatchSessionData,
  response: BackendMatchResponse,
) {
  return Boolean(
    state.pendingCommand === null &&
      state.match?.id === response.match.id &&
      state.match.revision === response.match.revision &&
      state.diagnostic === null,
  );
}

function diagnosticFromError(error: unknown): MatchSessionDiagnostic {
  if (error instanceof MatchApiContractError) {
    return {
      kind: "contract",
      message: error.message,
      retryable: true,
      metadata: error.metadata,
    };
  }
  if (error instanceof BackendRequestError) {
    return {
      kind: error.status === 409 ? "stale_command" : "network",
      message: error.message,
      retryable: error.retryable,
      status: error.status,
      code: error.code,
      recoveryAction: error.recoveryAction,
      metadata: error.metadata,
    };
  }
  return {
    kind: "network",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

export const useMatchSessionStore = create<MatchSessionStore>((set, get) => ({
  ...initialSessionState(),
  ...initialUiState,
  resetMatchSession: () =>
    set((state) => {
      const next = { ...createInitialMatchSession(), ...initialUiState };
      persistRecoveryJournal(next);
      return {
        ...next,
        // Do not let an unmounted route reuse a reset generation value.
        loadingGeneration: state.loadingGeneration + 1,
      };
    }),
  beginCreateCommand: (command) =>
    commandAccepted(
      updateSession(set, { type: "CREATE_REQUESTED", command }),
      command,
      "creating",
    ),
  setLoading: (loading) =>
    set((state) => ({
      loading,
      loadingGeneration: state.loadingGeneration + 1,
    })),
  beginHydrationLoading: () => {
    let generation = 0;
    set((state) => {
      generation = state.loadingGeneration + 1;
      return { loading: true, loadingGeneration: generation };
    });
    return generation;
  },
  finishHydrationLoading: (generation) =>
    set((state) => {
      if (state.loadingGeneration !== generation) return {};
      return {
        loading: false,
        loadingGeneration: generation + 1,
      };
    }),
  setError: (error) => {
    if (error === null) {
      updateSession(set, { type: "ERROR_CLEARED" });
      return;
    }
    updateSession(set, {
      type: "ERROR_RECORDED",
      diagnostic: diagnosticFromError(error),
    });
  },
  retainPendingCommand: (command) =>
    updateSession(set, { type: "COMMAND_RETAINED", command }),
  clearPendingCommand: () => updateSession(set, { type: "COMMAND_CLEARED" }),
  requireCommandReconciliation: (command) =>
    updateSession(set, { type: "COMMAND_RECONCILIATION_REQUIRED", command }),
  retainFieldDraft: (draft) =>
    updateSession(set, { type: "FIELD_DRAFT_RETAINED", draft }),
  clearFieldDraft: () => updateSession(set, { type: "FIELD_DRAFT_CLEARED" }),
  showTransitionLoader: (payload) =>
    set((state) => ({
      transitionLoader: {
        ...state.transitionLoader,
        visible: true,
        title: payload.title ?? state.transitionLoader.title,
        subtitle: payload.subtitle ?? state.transitionLoader.subtitle,
        stage: payload.stage ?? state.transitionLoader.stage,
        progress: payload.progress ?? state.transitionLoader.progress,
      },
    })),
  updateTransitionLoader: (payload) =>
    set((state) => ({
      transitionLoader: {
        ...state.transitionLoader,
        ...payload,
        visible: payload.visible ?? state.transitionLoader.visible,
      },
    })),
  hideTransitionLoader: () =>
    set((state) => ({
      transitionLoader: { ...state.transitionLoader, visible: false },
    })),
  setCreatedMatch: (payload) =>
    updateSession(set, { type: "MATCH_CREATED", payload }),
  beginStartCommand: (command) =>
    commandAccepted(
      updateSession(set, { type: "START_REQUESTED", command }),
      command,
      "starting",
    ),
  beginResumeCommand: (command) =>
    commandAccepted(
      updateSession(set, { type: "RESUME_REQUESTED", command }),
      command,
      "resuming",
    ),
  beginActionCommand: (command) =>
    commandAccepted(
      updateSession(set, { type: "ACTION_REQUESTED", command }),
      command,
      "submitting",
    ),
  setStartResponse: (response, command) => {
    if (!matchCommandsExactly(get().pendingCommand, command)) return false;
    return responseAccepted(
      updateSession(set, {
        type: "COMMAND_RESOLVED",
        command,
        response,
        source: "start",
      }),
      response,
    );
  },
  setResumeResponse: (response, command) => {
    if (!matchCommandsExactly(get().pendingCommand, command)) return false;
    return responseAccepted(
      updateSession(set, {
        type: "COMMAND_RESOLVED",
        command,
        response,
        source: "resume",
      }),
      response,
    );
  },
  setActionResponse: (response, command) => {
    if (!matchCommandsExactly(get().pendingCommand, command)) return false;
    return responseAccepted(
      updateSession(set, {
        type: "COMMAND_RESOLVED",
        command,
        response,
        source: "action",
      }),
      response,
    );
  },
  acknowledgeDecisionResult: () =>
    updateSession(set, { type: "RESULT_ACKNOWLEDGED" }),
  hydrateMatchSession: (payload) =>
    updateSession(set, { type: "HYDRATED", payload }),
  setPlaybackMinute: (minute) =>
    updateSession(set, { type: "TIMELINE_TICK", minute }),
  markSceneReady: () => updateSession(set, { type: "SCENE_READY" }),
  setEffort: (effort) => updateSession(set, { type: "EFFORT_CHANGED", effort }),
  setPlaystyle: (playstyle) =>
    updateSession(set, { type: "PLAYSTYLE_CHANGED", playstyle }),
}));

if (import.meta.env.VITE_E2E_MATCH_SESSION_BRIDGE === "true") {
  Object.defineProperty(globalThis, "__OVERGOAL_E2E_SET_MATCH_RESPONSE__", {
    configurable: true,
    value: (
      response: BackendMatchResponse,
      myTeam: BackendTeam,
      opponentTeam: BackendTeam,
    ) => {
      useMatchSessionStore.getState().hydrateMatchSession({
        match: response.match,
        myTeam,
        opponentTeam,
        timelineEvents: response.events,
        pendingAction: response.pending_action,
        unsupportedScene: response.unsupported_scene,
        legendAvailability: response.legend_availability,
        halftimeSummary: response.halftime_summary,
        fullTimeHandoff: response.full_time_handoff,
        latestOperation: response.latest_operation ?? null,
      });
    },
  });
  Object.defineProperty(globalThis, "__OVERGOAL_E2E_ADVANCE_TO_SCENE__", {
    configurable: true,
    value: (minute: number) => {
      const store = useMatchSessionStore.getState();
      store.setPlaybackMinute(minute);
      store.markSceneReady();
    },
  });
  Object.defineProperty(globalThis, "__OVERGOAL_E2E_READ_MATCH_SESSION__", {
    configurable: true,
    value: () => {
      const state = useMatchSessionStore.getState();
      return {
        diagnostic: state.diagnostic,
        matchId: state.match?.id ?? null,
        pendingCommand: state.pendingCommand,
        phase: state.phase,
        revision: state.match?.revision ?? null,
      };
    },
  });
}
