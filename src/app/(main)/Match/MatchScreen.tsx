import "../../(game)/field-assets";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { Button } from "../../../components/ui/button";
import {
  createMatchCommand,
  fetchBackendMatch,
  type MatchCommand,
  resumeBackendMatch,
} from "../../../lib/backend-match";
import {
  hasAuthoritativeMatchIdentity,
  hasAuthoritativeTimelineState,
} from "../../../match/authoritative-route-state";
import {
  beginHydration,
  createReconnectHydrationGate,
  isRetryableHydrationFailure,
  requestReconnectHydration,
  settleHydration,
} from "../../../match/reconnect-hydration";
import { useMatchSessionStore } from "../../../match/session-store";
import { EventFeed } from "./components/EventFeed";
import { LiveHeader } from "./components/LiveHeader";
import { MatchControls } from "./components/MatchControls";
import {
  HalftimePanel,
  LegendUnavailablePanel,
} from "./components/MatchLifecyclePanels";

type MatchEvent = {
  id: string;
  minute: number;
  text: string;
  type:
    | "normal"
    | "team-goal"
    | "opponent-goal"
    | "team-chance"
    | "opponent-chance";
};

function mapBackendEventType(event: {
  team: string;
  my_team_scored: boolean;
  opponent_team_scored: boolean;
  player_participates: boolean;
}): MatchEvent["type"] {
  if (event.my_team_scored) return "team-goal";
  if (event.opponent_team_scored) return "opponent-goal";
  if (event.player_participates && event.team === "MY_TEAM")
    return "team-chance";
  if (event.player_participates && event.team === "OPPONENT_TEAM")
    return "opponent-chance";
  return "normal";
}

export default function MatchScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const match = useMatchSessionStore((state) => state.match);
  const myTeam = useMatchSessionStore((state) => state.myTeam);
  const opponentTeam = useMatchSessionStore((state) => state.opponentTeam);
  const timelineEvents = useMatchSessionStore((state) => state.timelineEvents);
  const pendingAction = useMatchSessionStore((state) => state.pendingAction);
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const retrySafe = useMatchSessionStore((state) => state.retrySafe);
  const legendAvailability = useMatchSessionStore(
    (state) => state.legendAvailability,
  );
  const halftimeSummary = useMatchSessionStore(
    (state) => state.halftimeSummary,
  );
  const playbackMinute = useMatchSessionStore((state) => state.playbackMinute);
  const playbackStatus = useMatchSessionStore((state) => state.playbackStatus);
  const effort = useMatchSessionStore((state) => state.effort);
  const playstyle = useMatchSessionStore((state) => state.playstyle);
  const setEffort = useMatchSessionStore((state) => state.setEffort);
  const setPlaystyle = useMatchSessionStore((state) => state.setPlaystyle);
  const setPlaybackMinute = useMatchSessionStore(
    (state) => state.setPlaybackMinute,
  );
  const markSceneReady = useMatchSessionStore((state) => state.markSceneReady);
  const phase = useMatchSessionStore((state) => state.phase);
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const beginHydrationLoading = useMatchSessionStore(
    (state) => state.beginHydrationLoading,
  );
  const finishHydrationLoading = useMatchSessionStore(
    (state) => state.finishHydrationLoading,
  );
  const setError = useMatchSessionStore((state) => state.setError);
  const beginResumeCommand = useMatchSessionStore(
    (state) => state.beginResumeCommand,
  );
  const setResumeResponse = useMatchSessionStore(
    (state) => state.setResumeResponse,
  );
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const diagnostic = useMatchSessionStore((state) => state.diagnostic);
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const hideTransitionLoader = useMatchSessionStore(
    (state) => state.hideTransitionLoader,
  );
  const fieldTransitionTimeout = useRef<number | null>(null);
  const resumeLock = useRef(false);
  const resumeRequestGeneration = useRef(0);
  const activeResumeCommand = useRef<MatchCommand | null>(null);
  const reconnectHydrationGate = useRef(createReconnectHydrationGate());
  const hydrationRequestGeneration = useRef(0);
  const routeState = {
    routeMatchId: params.matchId,
    match,
    myTeam,
    opponentTeam,
  };
  const authoritativeMatchIdentity = hasAuthoritativeMatchIdentity(routeState);
  const authoritativeTimelineReady = hasAuthoritativeTimelineState(routeState);
  const presentingUnavailableSimulation = Boolean(
    authoritativeMatchIdentity &&
      match?.match_status === "FINISHED" &&
      phase === "legend_unavailable_simulation",
  );
  const timelinePresentationReady =
    authoritativeTimelineReady || presentingUnavailableSimulation;

  const targetMinute = pendingAction?.minute || match?.current_time || 0;
  const commandNeedsRouteReconciliation = Boolean(
    pendingCommand?.matchId === params.matchId &&
      (["starting", "resuming", "submitting"].includes(phase) ||
        (phase === "recoverable_error" &&
          diagnostic?.recoveryAction === "HYDRATE_MATCH")) &&
      // Reconcile commands inherited by this route, not the resume POST that
      // this mounted screen is already waiting for.
      !(phase === "resuming" && resumeLock.current),
  );

  useEffect(() => {
    resumeLock.current = false;
    resumeRequestGeneration.current += 1;
    return () => {
      resumeRequestGeneration.current += 1;
      resumeLock.current = false;
      const command = activeResumeCommand.current;
      activeResumeCommand.current = null;
      if (command) {
        useMatchSessionStore.getState().requireCommandReconciliation(command);
      }
    };
  }, [params.matchId]);

  useEffect(() => {
    const matchId = params.matchId;
    if (
      !matchId ||
      (authoritativeMatchIdentity &&
        reloadKey === 0 &&
        !commandNeedsRouteReconciliation)
    ) {
      return;
    }

    let cancelled = false;
    const requestGeneration = ++hydrationRequestGeneration.current;
    beginHydration(reconnectHydrationGate.current);
    setError(null);
    const loadingGeneration = beginHydrationLoading();

    const loadMatch = async () => {
      let succeeded = false;
      let retryableFailure = true;
      try {
        const response = await fetchBackendMatch(matchId);
        if (cancelled) return;
        const pendingAction =
          response.pending_action &&
          !response.pending_action.field_state &&
          response.field_state
            ? {
                ...response.pending_action,
                field_state: response.field_state,
              }
            : response.pending_action;
        hydrateMatchSession({
          match: response.match,
          myTeam: response.my_team,
          opponentTeam: response.opponent_team,
          timelineEvents: response.timeline,
          pendingAction,
          unsupportedScene: response.unsupported_scene,
          legendAvailability: response.legend_availability,
          halftimeSummary: response.halftime_summary,
          fullTimeHandoff: response.full_time_handoff,
          latestOperation: response.latest_operation,
        });
        succeeded = true;
      } catch (error) {
        retryableFailure = isRetryableHydrationFailure(error);
        if (cancelled) return;
        setError(error);
        hideTransitionLoader();
      } finally {
        if (requestGeneration === hydrationRequestGeneration.current) {
          const retryQueuedReconnect = settleHydration(
            reconnectHydrationGate.current,
            succeeded,
            retryableFailure,
          );
          if (!cancelled && retryQueuedReconnect) {
            setReloadKey((value) => value + 1);
          }
        }
      }
    };

    void loadMatch();

    return () => {
      cancelled = true;
      finishHydrationLoading(loadingGeneration);
    };
  }, [
    authoritativeMatchIdentity,
    commandNeedsRouteReconciliation,
    hideTransitionLoader,
    hydrateMatchSession,
    params.matchId,
    reloadKey,
    setError,
    beginHydrationLoading,
    finishHydrationLoading,
  ]);

  useEffect(() => {
    const retryAfterReconnect = () => {
      if (requestReconnectHydration(reconnectHydrationGate.current)) {
        setReloadKey((value) => value + 1);
      }
    };
    window.addEventListener("online", retryAfterReconnect);
    return () => window.removeEventListener("online", retryAfterReconnect);
  }, []);

  useEffect(() => {
    if (!authoritativeMatchIdentity || !match) return;
    if (match.match_status === "NOT_STARTED") {
      navigate(`/pre-match/${match.id}`, { replace: true });
      return;
    }
    if (
      match.match_status === "FINISHED" &&
      !(
        phase === "legend_unavailable_simulation" &&
        playbackMinute < match.current_time
      )
    ) {
      navigate(`/match-result/${match.id}`, { replace: true });
    }
  }, [authoritativeMatchIdentity, match, navigate, phase, playbackMinute]);

  useEffect(() => {
    if (!timelinePresentationReady || !match?.id || !params.matchId) {
      return;
    }

    updateTransitionLoader({
      progress: 100,
      stage: "Live feed",
      subtitle: "Live feed ready.",
    });

    const timeout = window.setTimeout(() => {
      hideTransitionLoader();
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [
    timelinePresentationReady,
    hideTransitionLoader,
    match?.id,
    params.matchId,
    updateTransitionLoader,
  ]);

  useEffect(() => {
    if (!match?.id || !params.matchId || match.id !== params.matchId) {
      return;
    }

    if (playbackStatus !== "timeline_playing") {
      return;
    }

    if (playbackMinute >= targetMinute) {
      if (pendingAction) markSceneReady();
      return;
    }

    const interval = window.setInterval(() => {
      setPlaybackMinute(
        Math.min(
          targetMinute,
          useMatchSessionStore.getState().playbackMinute + 1,
        ),
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    match?.id,
    params.matchId,
    pendingAction,
    playbackMinute,
    playbackStatus,
    setPlaybackMinute,
    markSceneReady,
    targetMinute,
  ]);

  useEffect(() => {
    if (!match?.id) {
      return;
    }
    if (phase === "result_playback") {
      navigate(`/game/${match.id}`, { replace: true });
      return;
    }
    if (phase !== "scene_ready") return;

    fieldTransitionTimeout.current = window.setTimeout(() => {
      navigate(`/game/${match.id}`);
    }, 2000);

    return () => {
      if (fieldTransitionTimeout.current) {
        window.clearTimeout(fieldTransitionTimeout.current);
      }
    };
  }, [match?.id, navigate, phase]);

  const visibleBackendEvents = useMemo(
    () => timelineEvents.filter((event) => event.minute <= playbackMinute),
    [playbackMinute, timelineEvents],
  );

  const visibleEvents = useMemo<MatchEvent[]>(
    () =>
      visibleBackendEvents.map((event) => ({
        id: `${event.match_id}_${event.event_id}`,
        minute: event.minute,
        text: event.description,
        type: mapBackendEventType(event),
      })),
    [visibleBackendEvents],
  );

  const lastScoreEvent = visibleBackendEvents[visibleBackendEvents.length - 1];
  const homeScore = lastScoreEvent?.my_team_score ?? match?.my_team_score ?? 0;
  const awayScore =
    lastScoreEvent?.opponent_team_score ?? match?.opponent_team_score ?? 0;

  // A retained resume command is retryable only after hydration has shown that
  // it did not commit. Do not disable the halftime control merely because the
  // exact command is still kept for that safe retry.
  const resumePending = phase === "resuming";

  const continueSecondHalf = async () => {
    if (
      !match ||
      !halftimeSummary?.continue_required ||
      resumeLock.current ||
      resumePending
    ) {
      return;
    }

    const retainedCommand =
      pendingCommand?.operation === "resume" &&
      pendingCommand.matchId === match.id &&
      pendingCommand.revision === match.revision
        ? pendingCommand
        : null;
    const command =
      retainedCommand ||
      createMatchCommand(
        "resume",
        { match_id: match.id },
        { matchId: match.id, revision: match.revision },
      );

    resumeLock.current = true;
    let requestGeneration: number | null = null;
    try {
      if (!beginResumeCommand(command)) {
        resumeLock.current = false;
        return;
      }
      activeResumeCommand.current = command;
      setError(null);
      requestGeneration = ++resumeRequestGeneration.current;
      const response = await resumeBackendMatch(match, command);
      if (requestGeneration !== resumeRequestGeneration.current) {
        if (activeResumeCommand.current === command) {
          useMatchSessionStore.getState().requireCommandReconciliation(command);
          activeResumeCommand.current = null;
        }
        resumeLock.current = false;
        return;
      }
      if (!setResumeResponse(response, command)) {
        activeResumeCommand.current = null;
        resumeLock.current = false;
        return;
      }
      activeResumeCommand.current = null;
      resumeLock.current = false;
    } catch (error) {
      if (requestGeneration !== resumeRequestGeneration.current) {
        if (activeResumeCommand.current) {
          useMatchSessionStore
            .getState()
            .requireCommandReconciliation(activeResumeCommand.current);
          activeResumeCommand.current = null;
        }
        resumeLock.current = false;
        return;
      }
      activeResumeCommand.current = null;
      setError(error);
      resumeLock.current = false;
    }
  };

  if (!timelinePresentationReady && !error) {
    return (
      <LoadingScreen
        isLoading={true}
        progress={loading ? 42 : 18}
        title="Opening live match"
        detail="Loading authoritative teams, score, and timeline"
        label="Loading live match"
      />
    );
  }

  if (error) {
    const recoveryAction = diagnostic?.recoveryAction;
    const title =
      recoveryAction === "REAUTHENTICATE"
        ? "Session expired"
        : recoveryAction === "STOP"
          ? "Match unavailable"
          : "Live match unavailable";
    const retryLabel =
      recoveryAction === "RETRY_SAME_REQUEST" &&
      retrySafe &&
      pendingCommand?.operation === "resume"
        ? "Retry same request"
        : recoveryAction === "HYDRATE_MATCH"
          ? "Refresh match state"
          : recoveryAction === "CHECK_TRANSPORT"
            ? "Check connection"
            : "Retry match";
    return (
      <main className="fixed inset-0 flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(234,36,112,0.15),transparent_34%),linear-gradient(180deg,#061124,#020816)] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-[2rem] border border-pink-400/45 bg-slate-950/85 px-7 py-8 text-center"
        >
          <p className="font-orbitron text-xs font-bold tracking-[0.32em] text-pink-300 uppercase">
            {title}
          </p>
          <p className="mt-5 text-sm leading-relaxed text-white/72">{error}</p>
          {recoveryAction !== "STOP" && (
            <Button
              className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 text-cyan-100 uppercase"
              onClick={() => {
                if (recoveryAction === "REAUTHENTICATE") {
                  navigate("/login");
                  return;
                }
                if (
                  recoveryAction === "RETRY_SAME_REQUEST" &&
                  retrySafe &&
                  pendingCommand?.operation === "resume"
                ) {
                  void continueSecondHalf();
                  return;
                }
                setError(null);
                setReloadKey((value) => value + 1);
              }}
            >
              {recoveryAction === "REAUTHENTICATE"
                ? "Sign in again"
                : retryLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            className="font-orbitron mt-3 min-h-11 w-full text-cyan-100 uppercase"
            onClick={() => navigate("/")}
          >
            Back to home
          </Button>
        </section>
      </main>
    );
  }

  if (!match || !myTeam || !opponentTeam) {
    return (
      <LoadingScreen
        isLoading={true}
        progress={42}
        title="Opening live match"
        detail="Restoring authoritative timeline presentation"
        label="Restoring live match"
      />
    );
  }

  return (
    <div
      data-testid="timeline-screen"
      data-session-phase={phase}
      data-session-loading={loading}
      data-playback-minute={playbackMinute}
      className="flex h-dvh w-full flex-col items-center overflow-hidden bg-[url('/backgrounds/glitch-bg.webp')] bg-center bg-no-repeat p-4 text-white"
    >
      <div className="z-10 flex h-full w-full max-w-4xl flex-col items-center justify-between gap-4 pb-4">
        <div className="flex min-h-0 w-full shrink flex-col items-center justify-center rounded-2xl">
          <LiveHeader
            homeTeamName={myTeam.name}
            awayTeamName={opponentTeam.name}
            homeScore={homeScore}
            awayScore={awayScore}
            time={playbackMinute}
          />
          <EventFeed events={visibleEvents} />
        </div>

        <div className="w-full shrink-0">
          {(phase === "halftime" || phase === "resuming") && halftimeSummary ? (
            <HalftimePanel
              summary={halftimeSummary}
              pending={resumePending}
              onContinue={continueSecondHalf}
            />
          ) : phase === "legend_unavailable_simulation" &&
            legendAvailability ? (
            <LegendUnavailablePanel
              availability={legendAvailability}
              minute={playbackMinute}
            />
          ) : (
            <MatchControls
              effort={effort}
              setEffort={setEffort}
              playstyle={playstyle}
              setPlaystyle={setPlaystyle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
