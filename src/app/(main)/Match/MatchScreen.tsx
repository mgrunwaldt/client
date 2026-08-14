import "../../(game)/field-assets";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { Button } from "../../../components/ui/button";
import {
  type BackendMatchSnapshot,
  BackendRequestError,
  createMatchCommand,
  fetchBackendMatch,
  type MatchCommand,
  resumeBackendMatch,
  updateBackendMatchTactics,
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
import type { EffortLevel, Playstyle } from "../../../match/session-types";
import {
  classifyTimelineEvent,
  presentTimelineEventDescription,
  type TimelineEventPresentationType,
} from "../../../match/timeline-event-presentation";
import {
  timelineMinuteDwellMs,
  timelineTargetMinute,
} from "../../../match/timeline-playback";
import { EventFeed } from "./components/EventFeed";
import { LegendEnergyMeter } from "./components/LegendEnergyMeter";
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
  type: TimelineEventPresentationType;
};

const effortToApi = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
} as const;

const playstyleToApi = {
  defense: "DEFENSIVE",
  balanced: "BALANCED",
  offensive: "OFFENSIVE",
} as const;

type TacticsSelection = {
  effort: EffortLevel;
  playstyle: Playstyle;
};

function tacticsSelectionsMatch(
  left: TacticsSelection,
  right: TacticsSelection,
) {
  return left.effort === right.effort && left.playstyle === right.playstyle;
}

export default function MatchScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [tacticsPending, setTacticsPending] = useState(false);
  const [queuedTactics, setQueuedTactics] = useState<TacticsSelection | null>(
    null,
  );
  const [tacticsSyncBlocked, setTacticsSyncBlocked] = useState(false);
  const [tacticsError, setTacticsError] = useState<string | null>(null);
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
  const setPlaybackMinute = useMatchSessionStore(
    (state) => state.setPlaybackMinute,
  );
  const markSceneReady = useMatchSessionStore((state) => state.markSceneReady);
  const phase = useMatchSessionStore((state) => state.phase);
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const confirmMatchTactics = useMatchSessionStore(
    (state) => state.confirmMatchTactics,
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
  const showTransitionLoader = useMatchSessionStore(
    (state) => state.showTransitionLoader,
  );
  const transitionLoaderVisible = useMatchSessionStore(
    (state) => state.transitionLoader.visible,
  );
  const resumeLock = useRef(false);
  const resumeRequestGeneration = useRef(0);
  const activeResumeCommand = useRef<MatchCommand | null>(null);
  const queuedTacticsRef = useRef<TacticsSelection | null>(null);
  const tacticsRetryCount = useRef(0);
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
  const halftimeEnergy = halftimeSummary?.legend_contribution;
  const currentEnergy =
    match?.legend_profile?.energy ?? halftimeEnergy?.energy_current;
  const energyCapacity =
    match?.legend_profile?.stamina ?? halftimeEnergy?.stamina;
  const resumePending = phase === "resuming";
  const selectedTactics = queuedTactics ?? { effort, playstyle };
  const tacticsSyncRequired = Boolean(queuedTactics && !tacticsSyncBlocked);

  const applySnapshot = useCallback(
    (response: BackendMatchSnapshot) => {
      const hydratedPendingAction =
        response.pending_action &&
        !response.pending_action.field_state &&
        response.field_state
          ? { ...response.pending_action, field_state: response.field_state }
          : response.pending_action;
      hydrateMatchSession({
        match: response.match,
        myTeam: response.my_team,
        opponentTeam: response.opponent_team,
        timelineEvents: response.timeline,
        pendingAction: hydratedPendingAction,
        unsupportedScene: response.unsupported_scene,
        legendAvailability: response.legend_availability,
        halftimeSummary: response.halftime_summary,
        fullTimeHandoff: response.full_time_handoff,
        latestOperation: response.latest_operation,
      });
    },
    [hydrateMatchSession],
  );

  const queueTactics = (selection: TacticsSelection) => {
    queuedTacticsRef.current = selection;
    tacticsRetryCount.current = 0;
    setQueuedTactics(selection);
    setTacticsSyncBlocked(false);
    setTacticsError(null);
  };

  const setEffort = (nextEffort: EffortLevel) => {
    const current = queuedTacticsRef.current ?? { effort, playstyle };
    queueTactics({ ...current, effort: nextEffort });
  };
  const setPlaystyle = (nextPlaystyle: Playstyle) => {
    const current = queuedTacticsRef.current ?? { effort, playstyle };
    queueTactics({ ...current, playstyle: nextPlaystyle });
  };

  const targetMinute = timelineTargetMinute(
    pendingAction?.minute,
    match?.current_time,
  );
  const hasPendingAction = Boolean(pendingAction);
  const currentMinuteDwellMs = timelineMinuteDwellMs(
    playbackMinute,
    timelineEvents,
  );
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
    queuedTacticsRef.current = null;
    tacticsRetryCount.current = 0;
    setQueuedTactics(null);
    setTacticsPending(false);
    setTacticsSyncBlocked(false);
    setTacticsError(null);
    return () => {
      resumeRequestGeneration.current += 1;
      resumeLock.current = false;
      queuedTacticsRef.current = null;
      const command = activeResumeCommand.current;
      activeResumeCommand.current = null;
      if (command) {
        useMatchSessionStore.getState().requireCommandReconciliation(command);
      }
    };
  }, [params.matchId]);

  useEffect(() => {
    if (
      !match ||
      !queuedTactics ||
      tacticsPending ||
      tacticsSyncBlocked ||
      resumePending ||
      resumeLock.current
    ) {
      return;
    }

    const authoritativeTactics = { effort, playstyle };
    if (tacticsSelectionsMatch(queuedTactics, authoritativeTactics)) {
      if (
        queuedTacticsRef.current &&
        tacticsSelectionsMatch(queuedTacticsRef.current, queuedTactics)
      ) {
        queuedTacticsRef.current = null;
        setQueuedTactics(null);
      }
      return;
    }

    const submittedTactics = queuedTactics;
    const requestMatch = match;
    setTacticsPending(true);
    setTacticsError(null);

    const syncTactics = async () => {
      try {
        const response = await updateBackendMatchTactics(requestMatch, {
          version: 1,
          effort: effortToApi[submittedTactics.effort],
          playstyle: playstyleToApi[submittedTactics.playstyle],
        });
        if (useMatchSessionStore.getState().match?.id !== requestMatch.id) {
          return;
        }
        const hydratedPendingAction =
          response.pending_action &&
          !response.pending_action.field_state &&
          response.field_state
            ? { ...response.pending_action, field_state: response.field_state }
            : response.pending_action;
        confirmMatchTactics({
          match: response.match,
          myTeam: response.my_team,
          opponentTeam: response.opponent_team,
          timelineEvents: response.timeline,
          pendingAction: hydratedPendingAction,
          unsupportedScene: response.unsupported_scene,
          legendAvailability: response.legend_availability,
          halftimeSummary: response.halftime_summary,
          fullTimeHandoff: response.full_time_handoff,
          latestOperation: response.latest_operation,
        });
        tacticsRetryCount.current = 0;
        if (
          queuedTacticsRef.current &&
          tacticsSelectionsMatch(queuedTacticsRef.current, submittedTactics)
        ) {
          queuedTacticsRef.current = null;
          setQueuedTactics(null);
        }
      } catch (error) {
        const canReconcileRevision =
          error instanceof BackendRequestError &&
          error.status === 409 &&
          tacticsRetryCount.current === 0;
        if (canReconcileRevision) {
          tacticsRetryCount.current = 1;
          try {
            const snapshot = await fetchBackendMatch(requestMatch.id);
            if (useMatchSessionStore.getState().match?.id === requestMatch.id) {
              applySnapshot(snapshot);
            }
          } catch (hydrationError) {
            setTacticsSyncBlocked(true);
            setTacticsError(
              hydrationError instanceof Error
                ? hydrationError.message
                : "Tactics could not sync. Tap your choice to retry.",
            );
          }
        } else {
          setTacticsSyncBlocked(true);
          setTacticsError(
            error instanceof Error
              ? error.message
              : "Tactics could not sync. Tap your choice to retry.",
          );
        }
      } finally {
        setTacticsPending(false);
      }
    };

    void syncTactics();
  }, [
    applySnapshot,
    confirmMatchTactics,
    effort,
    match,
    playstyle,
    queuedTactics,
    resumePending,
    tacticsPending,
    tacticsSyncBlocked,
  ]);

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
        applySnapshot(response);
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
    applySnapshot,
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

    const frame = window.requestAnimationFrame(() => {
      hideTransitionLoader();
    });

    return () => window.cancelAnimationFrame(frame);
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

    if (transitionLoaderVisible) {
      return;
    }

    const currentMinute = useMatchSessionStore.getState().playbackMinute;
    if (currentMinute >= targetMinute) {
      if (hasPendingAction) markSceneReady();
      return;
    }

    const tick = window.setTimeout(() => {
      const minute = useMatchSessionStore.getState().playbackMinute;
      const nextMinute = Math.min(targetMinute, minute + 1);
      setPlaybackMinute(nextMinute);
      if (nextMinute >= targetMinute && hasPendingAction) {
        markSceneReady();
      }
    }, currentMinuteDwellMs);

    return () => {
      window.clearTimeout(tick);
    };
  }, [
    currentMinuteDwellMs,
    hasPendingAction,
    match?.id,
    params.matchId,
    playbackMinute,
    playbackStatus,
    transitionLoaderVisible,
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
    if (phase !== "scene_ready" || tacticsPending || tacticsSyncRequired) {
      return;
    }

    showTransitionLoader({
      title: "YOUR MOVE",
      subtitle: pendingAction?.title ?? "A chance is opening on the field.",
      stage: "Opening field",
      progress: 78,
    });
    navigate(`/game/${match.id}`);
  }, [
    match?.id,
    navigate,
    pendingAction?.title,
    phase,
    showTransitionLoader,
    tacticsPending,
    tacticsSyncRequired,
  ]);

  const visibleBackendEvents = useMemo(
    () => timelineEvents.filter((event) => event.minute <= playbackMinute),
    [playbackMinute, timelineEvents],
  );

  const visibleEvents = useMemo<MatchEvent[]>(
    () =>
      visibleBackendEvents.map((event) => ({
        id: `${event.match_id}_${event.event_id}`,
        minute: event.minute,
        text: presentTimelineEventDescription(event.description),
        type: classifyTimelineEvent(event),
      })),
    [visibleBackendEvents],
  );

  const lastScoreEvent = visibleBackendEvents[visibleBackendEvents.length - 1];
  const homeScore = lastScoreEvent?.my_team_score ?? match?.my_team_score ?? 0;
  const awayScore =
    lastScoreEvent?.opponent_team_score ?? match?.opponent_team_score ?? 0;
  const scoringEvent = visibleBackendEvents
    .slice()
    .reverse()
    .find(
      (event) =>
        event.minute === playbackMinute &&
        (event.my_team_scored || event.opponent_team_scored),
    );
  const scoreChange = scoringEvent
    ? {
        side: scoringEvent.my_team_scored
          ? ("home" as const)
          : ("away" as const),
        eventId: `${scoringEvent.match_id}_${scoringEvent.event_id}`,
      }
    : null;

  const advanceAuthoritativeMatch = useCallback(async () => {
    if (
      !match ||
      resumeLock.current ||
      resumePending ||
      tacticsPending ||
      tacticsSyncRequired
    ) {
      return;
    }
    const resumesHalftime =
      match.match_status === "HALFTIME" &&
      halftimeSummary?.continue_required === true;
    const advancesTimeline =
      match.match_status === "IN_PROGRESS" &&
      !pendingAction &&
      playbackMinute >= match.current_time;
    if (!resumesHalftime && !advancesTimeline) return;

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
  }, [
    beginResumeCommand,
    halftimeSummary?.continue_required,
    match,
    pendingAction,
    pendingCommand,
    playbackMinute,
    resumePending,
    setError,
    setResumeResponse,
    tacticsPending,
    tacticsSyncRequired,
  ]);

  const continueSecondHalf = () => {
    void advanceAuthoritativeMatch();
  };

  useEffect(() => {
    if (
      (phase !== "timeline_playback" &&
        phase !== "legend_unavailable_simulation") ||
      match?.match_status !== "IN_PROGRESS" ||
      pendingAction ||
      playbackMinute < match.current_time ||
      resumePending ||
      tacticsPending ||
      tacticsSyncRequired ||
      transitionLoaderVisible
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void advanceAuthoritativeMatch();
    }, currentMinuteDwellMs);
    return () => window.clearTimeout(timeout);
  }, [
    advanceAuthoritativeMatch,
    currentMinuteDwellMs,
    match?.current_time,
    match?.match_status,
    pendingAction,
    phase,
    playbackMinute,
    resumePending,
    tacticsPending,
    tacticsSyncRequired,
    transitionLoaderVisible,
  ]);

  if (!timelinePresentationReady && !error) {
    return (
      <LoadingScreen
        isLoading={true}
        title="Opening live match"
        detail="Bringing the live match back"
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
        detail="Restoring your live match"
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
      data-minute-dwell-ms={currentMinuteDwellMs}
      data-effort={selectedTactics.effort}
      data-playstyle={selectedTactics.playstyle}
      data-tactics-sync={
        tacticsPending || tacticsSyncRequired ? "pending" : "settled"
      }
      className="overgoal-safe-screen flex h-dvh w-full flex-col items-center overflow-hidden bg-[url('/backgrounds/glitch-bg.webp')] bg-center bg-no-repeat text-white [--overgoal-safe-bottom-min:0.5rem] [--overgoal-safe-inline-min:0.5rem] [--overgoal-safe-top-min:0.5rem] sm:[--overgoal-safe-inline-min:0.75rem]"
    >
      <div className="z-10 flex h-full min-h-0 w-full max-w-4xl flex-col items-center gap-2">
        <div className="flex min-h-0 w-full flex-1 flex-col items-center rounded-2xl">
          <LiveHeader
            homeTeamName={myTeam.name}
            awayTeamName={opponentTeam.name}
            homeScore={homeScore}
            awayScore={awayScore}
            time={playbackMinute}
            scoreChange={scoreChange}
          />
          <EventFeed
            events={visibleEvents}
            currentMinute={playbackMinute}
            advancing={resumePending}
            opportunityIncoming={
              hasPendingAction && playbackMinute < targetMinute
            }
          />
        </div>

        <div className="w-full shrink-0">
          {currentEnergy !== undefined &&
            energyCapacity !== undefined &&
            match.match_status !== "HALFTIME" && (
              <LegendEnergyMeter
                current={currentEnergy}
                capacity={energyCapacity}
              />
            )}
          {match.match_status === "HALFTIME" &&
          playbackMinute >= match.current_time &&
          halftimeSummary ? (
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
              effort={selectedTactics.effort}
              setEffort={setEffort}
              playstyle={selectedTactics.playstyle}
              setPlaystyle={setPlaystyle}
              syncing={tacticsPending || tacticsSyncRequired}
              error={tacticsError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
