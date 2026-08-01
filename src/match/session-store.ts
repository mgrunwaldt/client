import { create } from "zustand";

import type { MatchCommand } from "./api-v1/adapter";
import type {
  BackendMatch,
  BackendMatchResponse,
  BackendTeam,
} from "./api-v1/contract";
import {
  createInitialMatchSession,
  matchSessionReducer,
} from "./session-machine";
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
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  retainPendingCommand: (command: MatchCommand) => void;
  clearPendingCommand: () => void;
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
  beginStartCommand: (command: MatchCommand) => void;
  beginActionCommand: (command: MatchCommand) => void;
  setStartResponse: (response: BackendMatchResponse) => void;
  setActionResponse: (response: BackendMatchResponse) => void;
  acknowledgeDecisionResult: () => void;
  hydrateMatchSession: (payload: HydratedMatchSession) => void;
  setPlaybackMinute: (minute: number) => void;
  markSceneReady: () => void;
  setEffort: (effort: EffortLevel) => void;
  setPlaystyle: (playstyle: Playstyle) => void;
}

interface MatchSessionUiState {
  loading: boolean;
  transitionLoader: MatchTransitionLoaderState;
}

type MatchSessionStore = MatchSessionData &
  MatchSessionUiState &
  MatchSessionActions;

const initialUiState: MatchSessionUiState = {
  loading: false,
  transitionLoader: {
    visible: false,
    title: "Loading",
    subtitle: "",
    progress: 0,
  },
};

function loadingForPhase(phase: MatchSessionData["phase"]) {
  return phase === "creating" || phase === "starting" || phase === "submitting";
}

function updateSession(
  set: (
    partial:
      | Partial<MatchSessionStore>
      | ((state: MatchSessionStore) => Partial<MatchSessionStore>),
  ) => void,
  event: Parameters<typeof matchSessionReducer>[1],
) {
  set((state) => {
    const next = matchSessionReducer(state, event);
    return {
      ...next,
      loading: loadingForPhase(next.phase),
    };
  });
}

function diagnosticFromMessage(error: string): MatchSessionDiagnostic {
  return {
    kind: "network",
    message: error,
    retryable: true,
  };
}

export const useMatchSessionStore = create<MatchSessionStore>((set) => ({
  ...createInitialMatchSession(),
  ...initialUiState,
  resetMatchSession: () =>
    set({ ...createInitialMatchSession(), ...initialUiState }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => {
    if (error === null) {
      updateSession(set, { type: "ERROR_CLEARED" });
      return;
    }
    updateSession(set, {
      type: "ERROR_RECORDED",
      diagnostic: diagnosticFromMessage(error),
    });
  },
  retainPendingCommand: (command) =>
    updateSession(set, { type: "COMMAND_RETAINED", command }),
  clearPendingCommand: () => updateSession(set, { type: "COMMAND_CLEARED" }),
  showTransitionLoader: (payload) =>
    set((state) => ({
      transitionLoader: {
        ...state.transitionLoader,
        visible: true,
        title: payload.title ?? state.transitionLoader.title,
        subtitle: payload.subtitle ?? state.transitionLoader.subtitle,
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
    updateSession(set, { type: "START_REQUESTED", command }),
  beginActionCommand: (command) =>
    updateSession(set, { type: "ACTION_REQUESTED", command }),
  setStartResponse: (response) =>
    updateSession(set, {
      type: "COMMAND_RESOLVED",
      response,
      source: "start",
    }),
  setActionResponse: (response) =>
    updateSession(set, {
      type: "COMMAND_RESOLVED",
      response,
      source: "action",
    }),
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
      useMatchSessionStore.getState().setCreatedMatch({
        match: response.match,
        myTeam,
        opponentTeam,
      });
      useMatchSessionStore.getState().setStartResponse(response);
    },
  });
}
