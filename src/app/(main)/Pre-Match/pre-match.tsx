import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import preMatchBackground from "/backgrounds/glitch-bg.webp";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { BackButton } from "../../../components/ui/back-button";
import { Button } from "../../../components/ui/button";
import { GlitchText } from "../../../components/ui/glitch-text";
import {
  type BackendTeam,
  createMatchCommand,
  fetchBackendMatch,
  type MatchCommand,
  startBackendMatch,
} from "../../../lib/backend-match";
import {
  hasAuthoritativeMatchIdentity,
  hasAuthoritativePrematchState,
} from "../../../match/authoritative-route-state";
import { preloadMatchExperience } from "../../../match/match-preload";
import {
  beginHydration,
  createReconnectHydrationGate,
  isRetryableHydrationFailure,
  requestReconnectHydration,
  settleHydration,
} from "../../../match/reconnect-hydration";
import { useMatchSessionStore } from "../../../match/session-store";
import { cn } from "../../../utils/utils";
import teamsData from "../Seasons/components/teams.json";
import PreMatchLegend from "./components/pre-match-legend";
import PreMatchTeam from "./components/pre-match-team";

function teamImageFor(team: BackendTeam) {
  return teamsData.find((candidate) => candidate.name === team.name)?.imageUrl;
}

export default function PreMatchScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const startLock = useRef(false);
  const startCompleted = useRef(false);
  const startRequestGeneration = useRef(0);
  const activeStartCommand = useRef<MatchCommand | null>(null);
  const preserveTransitionLoader = useRef(false);
  const hydrationGate = useRef(createReconnectHydrationGate());
  const hydrationRequestGeneration = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);
  const match = useMatchSessionStore((state) => state.match);
  const myTeam = useMatchSessionStore((state) => state.myTeam);
  const opponentTeam = useMatchSessionStore((state) => state.opponentTeam);
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const setStartResponse = useMatchSessionStore(
    (state) => state.setStartResponse,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const beginHydrationLoading = useMatchSessionStore(
    (state) => state.beginHydrationLoading,
  );
  const finishHydrationLoading = useMatchSessionStore(
    (state) => state.finishHydrationLoading,
  );
  const setError = useMatchSessionStore((state) => state.setError);
  const beginStartCommand = useMatchSessionStore(
    (state) => state.beginStartCommand,
  );
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const retrySafe = useMatchSessionStore((state) => state.retrySafe);
  const showTransitionLoader = useMatchSessionStore(
    (state) => state.showTransitionLoader,
  );
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const diagnostic = useMatchSessionStore((state) => state.diagnostic);
  const phase = useMatchSessionStore((state) => state.phase);
  const legendProfile = match?.legend_profile;
  const legendPlayerId = match?.legend_player_id;
  const routeState = {
    routeMatchId: params.matchId,
    match,
    myTeam,
    opponentTeam,
  };
  const authoritativeMatchIdentity = hasAuthoritativeMatchIdentity(routeState);
  const authoritativeMatchReady = hasAuthoritativePrematchState(routeState);

  useEffect(() => {
    startLock.current = false;
    startCompleted.current = false;
    preserveTransitionLoader.current = false;
    startRequestGeneration.current += 1;
    return () => {
      startRequestGeneration.current += 1;
      startLock.current = false;
      const command = activeStartCommand.current;
      activeStartCommand.current = null;
      if (command) {
        useMatchSessionStore.getState().requireCommandReconciliation(command);
      }
      if (!preserveTransitionLoader.current) {
        useMatchSessionStore.getState().hideTransitionLoader();
      }
    };
  }, [params.matchId]);

  useEffect(() => {
    const matchId = params.matchId;
    if (
      !matchId ||
      (reloadKey === 0 &&
        (authoritativeMatchReady ||
          (authoritativeMatchIdentity &&
            match?.match_status !== "NOT_STARTED")))
    ) {
      return;
    }

    let cancelled = false;
    const requestGeneration = ++hydrationRequestGeneration.current;
    beginHydration(hydrationGate.current);
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
      } finally {
        if (requestGeneration === hydrationRequestGeneration.current) {
          const retryQueuedReconnect = settleHydration(
            hydrationGate.current,
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
    hydrateMatchSession,
    authoritativeMatchIdentity,
    authoritativeMatchReady,
    match?.id,
    match?.match_status,
    params.matchId,
    reloadKey,
    setError,
    beginHydrationLoading,
    finishHydrationLoading,
  ]);

  useEffect(() => {
    const matchId = match?.id;
    if (!authoritativeMatchIdentity || !matchId) return;
    if (startLock.current || startCompleted.current) return;
    if (phase === "finished") {
      navigate(`/match-result/${matchId}`, { replace: true });
      return;
    }
    if (match.match_status !== "NOT_STARTED") {
      navigate(`/match/${matchId}`, { replace: true });
    }
  }, [authoritativeMatchIdentity, match, navigate, phase]);

  useEffect(() => {
    if (!authoritativeMatchReady || phase !== "created") return;
    // PREMATCH is the earliest safe point to warm the timeline and field
    // without loading game assets on login or unrelated routes.
    void preloadMatchExperience().catch(() => undefined);
  }, [authoritativeMatchReady, phase]);

  useEffect(() => {
    const rehydrateAfterReconnect = () => {
      if (requestReconnectHydration(hydrationGate.current)) {
        setReloadKey((value) => value + 1);
      }
    };
    window.addEventListener("online", rehydrateAfterReconnect);
    return () => window.removeEventListener("online", rehydrateAfterReconnect);
  }, []);

  const handleStartMatch = async () => {
    if (startLock.current) return;
    startLock.current = true;

    const matchId = match?.id || params.matchId;
    if (!matchId) {
      startLock.current = false;
      return;
    }

    let requestGeneration = startRequestGeneration.current;
    try {
      const matchSnapshot = match;
      if (!matchSnapshot) {
        throw new Error("Match state is unavailable. Reconnect and try again.");
      }

      if (!startCompleted.current) {
        const retainedCommand =
          pendingCommand?.operation === "start" &&
          pendingCommand.matchId === matchId
            ? pendingCommand
            : null;
        const exactRetryAuthorized = Boolean(
          retainedCommand &&
            phase === "recoverable_error" &&
            retrySafe &&
            diagnostic?.recoveryAction === "RETRY_SAME_REQUEST",
        );
        if (retainedCommand && !exactRetryAuthorized) {
          startLock.current = false;
          setReloadKey((value) => value + 1);
          return;
        }
        setError(null);
        const command =
          retainedCommand ??
          createMatchCommand(
            "start",
            { match_id: matchId },
            { matchId, revision: matchSnapshot.revision ?? null },
          );
        if (!beginStartCommand(command)) {
          startLock.current = false;
          return;
        }
        activeStartCommand.current = command;

        showTransitionLoader({
          title: "Starting Match",
          subtitle: "Waiting for the authoritative kickoff state.",
          stage: "Match engine",
          progress: 8,
        });
        requestGeneration = ++startRequestGeneration.current;
        const response = await startBackendMatch(matchSnapshot, command);
        if (requestGeneration !== startRequestGeneration.current) {
          if (activeStartCommand.current === command) {
            useMatchSessionStore
              .getState()
              .requireCommandReconciliation(command);
            activeStartCommand.current = null;
            useMatchSessionStore.getState().hideTransitionLoader();
          }
          startLock.current = false;
          return;
        }
        updateTransitionLoader({
          stage: "Backend response",
          progress: 38,
          subtitle: "Kickoff state and live events received.",
        });
        if (!setStartResponse(response, command)) {
          activeStartCommand.current = null;
          startLock.current = false;
          setLoading(false);
          useMatchSessionStore.getState().hideTransitionLoader();
          return;
        }
        activeStartCommand.current = null;
        startCompleted.current = true;
      } else {
        showTransitionLoader({
          title: "Starting Match",
          subtitle: "Retrying the local match presentation.",
          stage: "Match presentation",
          progress: 38,
        });
      }

      await preloadMatchExperience((update) => {
        if (requestGeneration !== startRequestGeneration.current) return;
        updateTransitionLoader({
          stage: update.stage,
          progress: 40 + update.progress * 0.54,
          subtitle: update.detail,
        });
      });
      if (requestGeneration !== startRequestGeneration.current) return;
      if (!startCompleted.current) return;
      updateTransitionLoader({
        stage: "Live feed",
        progress: 96,
        subtitle: "Opening the minute-by-minute timeline.",
      });
      preserveTransitionLoader.current = true;
      navigate(`/match/${matchId}`);
    } catch (error) {
      if (requestGeneration !== startRequestGeneration.current) {
        if (activeStartCommand.current) {
          useMatchSessionStore
            .getState()
            .requireCommandReconciliation(activeStartCommand.current);
          activeStartCommand.current = null;
          useMatchSessionStore.getState().hideTransitionLoader();
        }
        startLock.current = false;
        return;
      }
      activeStartCommand.current = null;
      setError(error);
      setLoading(false);
      useMatchSessionStore.getState().hideTransitionLoader();
      startLock.current = false;
    }
  };

  if (!authoritativeMatchReady && !error) {
    return (
      <LoadingScreen
        isLoading={true}
        progress={loading ? 32 : 18}
        title="Preparing matchup"
        detail="Loading authoritative teams and match state"
        label="Loading pre-match data"
      />
    );
  }

  if (!authoritativeMatchReady && error) {
    const recoveryAction = diagnostic?.recoveryAction;
    return (
      <main className="fixed inset-0 flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(234,36,112,0.15),transparent_34%),linear-gradient(180deg,#061124,#020816)] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-[2rem] border border-pink-400/45 bg-slate-950/85 px-7 py-8 text-center"
        >
          <p className="font-orbitron text-xs font-bold tracking-[0.32em] text-pink-300 uppercase">
            {recoveryAction === "REAUTHENTICATE"
              ? "Session expired"
              : "Match unavailable"}
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
                setError(null);
                setReloadKey((value) => value + 1);
              }}
            >
              {recoveryAction === "REAUTHENTICATE"
                ? "Sign in again"
                : recoveryAction === "CHECK_TRANSPORT"
                  ? "Check connection"
                  : "Retry match"}
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

  if (!match || !myTeam || !opponentTeam || !legendProfile || !legendPlayerId) {
    return (
      <LoadingScreen
        isLoading={true}
        progress={32}
        title="Preparing matchup"
        detail="Restoring authoritative match presentation"
        label="Restoring pre-match data"
      />
    );
  }

  return (
    <div
      data-testid="prematch-screen"
      data-session-phase={phase}
      data-session-loading={loading}
      className="bg-overgoal-dark-blue h-full min-h-dvh w-full p-4"
    >
      <img
        src={preMatchBackground}
        alt="pre-match-background"
        className="absolute inset-0 z-0 h-screen min-h-dvh w-full object-cover"
      />
      <div className="relative z-100! flex w-full flex-col items-center justify-between">
        <BackButton className="mr-auto h-12 w-12" to="/" />

        <div className="z-100! flex h-full w-full flex-col items-center justify-center gap-4 py-8">
          <GlitchText className="text-2xl" text="Get ready to play" />

          <div className="relative flex h-full w-full flex-row items-center justify-center gap-1">
            <PreMatchTeam
              teamName={myTeam.name}
              teamImage={teamImageFor(myTeam)}
              side="left"
              isMyTeam={true}
            />

            <span className="font-orbitron text-2xl font-bold text-white uppercase">
              vs
            </span>

            <PreMatchTeam
              teamName={opponentTeam.name}
              teamImage={teamImageFor(opponentTeam)}
              side="right"
              isMyTeam={false}
            />
          </div>

          <PreMatchLegend
            legendPlayerId={legendPlayerId}
            legendProfile={legendProfile}
          />

          <div className="mt-16 flex w-full flex-col items-center justify-center">
            <div
              className={cn(
                "z-100 h-full max-h-[73px] w-full max-w-[236px]",
                "flex items-center justify-center",
                "bg-[url('/homepage/play_button.svg')] bg-contain bg-center",
                "disabled:opacity-90",
                "bg-no-repeat",
              )}
            >
              <Button
                className="h-full w-full"
                onClick={() => {
                  const exactRetryAuthorized = Boolean(
                    error &&
                      retrySafe &&
                      diagnostic?.recoveryAction === "RETRY_SAME_REQUEST" &&
                      pendingCommand?.operation === "start" &&
                      pendingCommand.matchId === match.id,
                  );
                  if (error && !exactRetryAuthorized) {
                    setReloadKey((value) => value + 1);
                    return;
                  }
                  void handleStartMatch();
                }}
                disabled={loading}
                aria-describedby={error ? "start-match-error" : undefined}
              >
                <p className="airstrike-normal !text-5xl text-white uppercase">
                  {loading
                    ? "..."
                    : error
                      ? retrySafe &&
                        diagnostic?.recoveryAction === "RETRY_SAME_REQUEST"
                        ? "Retry"
                        : "Refresh"
                      : "Play"}
                </p>
              </Button>
            </div>
            {error ? (
              <p
                id="start-match-error"
                role="alert"
                className="mt-4 w-full max-w-sm rounded-xl border border-pink-400/45 bg-slate-950/90 px-4 py-3 text-center text-sm text-pink-100"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
