import { create } from "zustand";

import {
  BackendFieldState,
  BackendMatch,
  BackendMatchResponse,
  BackendPendingAction,
  BackendTeam,
  BackendTimelineEvent,
  type MatchCommand,
} from "../lib/backend-match";

export type EffortLevel = "low" | "medium" | "high";
export type Playstyle = "defense" | "balanced" | "offensive";
export type MatchPlaybackStatus =
  | "idle"
  | "created"
  | "timeline_playing"
  | "timeline_ready_for_field"
  | "field_ready";

export interface MatchTransitionLoaderState {
  visible: boolean;
  title: string;
  subtitle: string;
  progress: number;
}

interface MatchSessionState {
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
  loading: boolean;
  error: string | null;
  pendingCommand: MatchCommand | null;
  transitionLoader: MatchTransitionLoaderState;
}

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
  setStartResponse: (response: BackendMatchResponse) => void;
  setActionResponse: (response: BackendMatchResponse) => void;
  hydrateMatchSession: (payload: {
    match: BackendMatch;
    myTeam: BackendTeam;
    opponentTeam: BackendTeam;
    timelineEvents: BackendTimelineEvent[];
    pendingAction?: BackendPendingAction | null;
  }) => void;
  setPlaybackMinute: (minute: number) => void;
  setPlaybackStatus: (status: MatchPlaybackStatus) => void;
  setEffort: (effort: EffortLevel) => void;
  setPlaystyle: (playstyle: Playstyle) => void;
}

type MatchSessionStore = MatchSessionState & MatchSessionActions;

const initialState: MatchSessionState = {
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
  loading: false,
  error: null,
  pendingCommand: null,
  transitionLoader: {
    visible: false,
    title: "Loading",
    subtitle: "",
    progress: 0,
  },
};

function mergeTimelineEvents(
  existing: BackendTimelineEvent[],
  incoming: BackendTimelineEvent[],
) {
  const merged = new Map<string, BackendTimelineEvent>();

  [...existing, ...incoming].forEach((event) => {
    merged.set(`${event.match_id}_${event.event_id}`, event);
  });

  return Array.from(merged.values()).sort((left, right) => {
    if (left.minute !== right.minute) {
      return left.minute - right.minute;
    }
    return left.event_id - right.event_id;
  });
}

function playbackStatusFromResponse(
  response: BackendMatchResponse,
): MatchPlaybackStatus {
  if (response.pending_action) {
    return "timeline_playing";
  }

  return response.minute > response.prev_time ? "timeline_playing" : "idle";
}

export const useMatchSessionStore = create<MatchSessionStore>((set) => ({
  ...initialState,
  resetMatchSession: () => set(initialState),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  retainPendingCommand: (pendingCommand) => set({ pendingCommand }),
  clearPendingCommand: () => set({ pendingCommand: null }),
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
      transitionLoader: {
        ...state.transitionLoader,
        visible: false,
      },
    })),
  setCreatedMatch: ({ match, myTeam, opponentTeam }) =>
    set({
      match,
      myTeam,
      opponentTeam,
      pendingAction: null,
      fieldState: null,
      timelineEvents: [],
      playbackMinute: 0,
      playbackStatus: "created",
      loading: false,
      error: null,
      pendingCommand: null,
    }),
  setStartResponse: (response) =>
    set((state) => ({
      match: response.match,
      myTeam: state.myTeam,
      opponentTeam: state.opponentTeam,
      pendingAction: response.pending_action,
      fieldState:
        response.pending_action?.field_state || response.field_state || null,
      timelineEvents: mergeTimelineEvents([], response.events || []),
      playbackMinute: response.prev_time,
      playbackStatus: playbackStatusFromResponse(response),
      loading: false,
      error: null,
      pendingCommand: null,
    })),
  setActionResponse: (response) =>
    set((state) => ({
      match: response.match,
      myTeam: state.myTeam,
      opponentTeam: state.opponentTeam,
      pendingAction: response.pending_action,
      fieldState:
        response.pending_action?.field_state || response.field_state || null,
      timelineEvents: mergeTimelineEvents(
        state.timelineEvents,
        response.events || [],
      ),
      playbackMinute: response.prev_time,
      playbackStatus: playbackStatusFromResponse(response),
      loading: false,
      error: null,
      pendingCommand: null,
    })),
  hydrateMatchSession: ({
    match,
    myTeam,
    opponentTeam,
    timelineEvents,
    pendingAction: hydratedPendingAction,
  }) =>
    set((state) => {
      const pendingAction =
        hydratedPendingAction === undefined
          ? (match.pending_action ?? null)
          : hydratedPendingAction;
      const hydratedMatch =
        match.pending_action === pendingAction
          ? match
          : { ...match, pending_action: pendingAction };
      const isWaitingForDecision =
        match.match_status === "WAITING_FOR_DECISION" && pendingAction !== null;
      const isSameMatch = state.match?.id === match.id;
      // A snapshot is authoritative. Lifecycle stops must not retain a field from
      // the preceding decision while the singleton remains mounted.
      const fieldState = isWaitingForDecision
        ? pendingAction.field_state || null
        : null;
      const shouldPlayTimeline =
        isWaitingForDecision &&
        (!isSameMatch || state.playbackStatus === "idle");

      return {
        match: hydratedMatch,
        myTeam,
        opponentTeam,
        pendingAction,
        fieldState,
        timelineEvents,
        playbackMinute: isWaitingForDecision
          ? shouldPlayTimeline
            ? 0
            : state.playbackMinute
          : match.current_time,
        playbackStatus: isWaitingForDecision
          ? shouldPlayTimeline
            ? "timeline_playing"
            : state.playbackStatus
          : "idle",
        loading: false,
        error: null,
        pendingCommand:
          state.pendingCommand?.matchId === match.id &&
          state.pendingCommand.actionId === pendingAction?.id
            ? state.pendingCommand
            : null,
      };
    }),
  setPlaybackMinute: (playbackMinute) => set({ playbackMinute }),
  setPlaybackStatus: (playbackStatus) => set({ playbackStatus }),
  setEffort: (effort) => set({ effort }),
  setPlaystyle: (playstyle) => set({ playstyle }),
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
