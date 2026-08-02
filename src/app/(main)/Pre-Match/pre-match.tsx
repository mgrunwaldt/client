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
  startBackendMatch,
} from "../../../lib/backend-match";
import { preloadMatchExperience } from "../../../match/match-preload";
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
  const setError = useMatchSessionStore((state) => state.setError);
  const beginStartCommand = useMatchSessionStore(
    (state) => state.beginStartCommand,
  );
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const showTransitionLoader = useMatchSessionStore(
    (state) => state.showTransitionLoader,
  );
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const phase = useMatchSessionStore((state) => state.phase);
  const legendProfile = match?.legend_profile;
  const legendPlayerId = match?.legend_player_id;
  const authoritativeMatchReady =
    match?.id === params.matchId && Boolean(myTeam) && Boolean(opponentTeam);

  useEffect(() => {
    const matchId = params.matchId;
    if (!matchId || (match?.id && match.id === matchId)) {
      return;
    }

    let cancelled = false;

    const loadMatch = async () => {
      try {
        setLoading(true);
        setError(null);
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
        });
      } catch (error) {
        if (cancelled) return;
        setError(error);
        setLoading(false);
      }
    };

    void loadMatch();

    return () => {
      cancelled = true;
    };
  }, [
    hydrateMatchSession,
    match?.id,
    params.matchId,
    reloadKey,
    setError,
    setLoading,
  ]);

  useEffect(() => {
    const matchId = match?.id;
    if (!authoritativeMatchReady || !matchId) return;
    if (startLock.current || startCompleted.current) return;
    if (phase === "finished") {
      navigate(`/match-result/${matchId}`, { replace: true });
      return;
    }
    if (match.match_status !== "NOT_STARTED") {
      navigate(`/match/${matchId}`, { replace: true });
    }
  }, [authoritativeMatchReady, match, navigate, phase]);

  useEffect(() => {
    if (!authoritativeMatchReady || phase !== "created") return;
    // PREMATCH is the earliest safe point to warm the timeline and field
    // without loading game assets on login or unrelated routes.
    void preloadMatchExperience().catch(() => undefined);
  }, [authoritativeMatchReady, phase]);

  const handleStartMatch = async () => {
    if (startLock.current) return;
    startLock.current = true;

    const matchId = match?.id || params.matchId;
    if (!matchId) {
      startLock.current = false;
      return;
    }

    try {
      setError(null);
      const matchSnapshot = match;
      if (!matchSnapshot) {
        throw new Error("Match state is unavailable. Reconnect and try again.");
      }

      if (!startCompleted.current) {
        const command =
          pendingCommand?.operation === "start" &&
          pendingCommand.matchId === matchId
            ? pendingCommand
            : createMatchCommand(
                "start",
                { match_id: matchId },
                { matchId, revision: matchSnapshot.revision ?? null },
              );
        if (!beginStartCommand(command)) {
          startLock.current = false;
          return;
        }

        showTransitionLoader({
          title: "Starting Match",
          subtitle: "Waiting for the authoritative kickoff state.",
          stage: "Match engine",
          progress: 8,
        });
        const response = await startBackendMatch(matchSnapshot, command);
        updateTransitionLoader({
          stage: "Backend response",
          progress: 38,
          subtitle: "Kickoff state and live events received.",
        });
        setStartResponse(response);
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
        updateTransitionLoader({
          stage: update.stage,
          progress: 40 + update.progress * 0.54,
          subtitle: update.detail,
        });
      });
      updateTransitionLoader({
        stage: "Live feed",
        progress: 96,
        subtitle: "Opening the minute-by-minute timeline.",
      });
      navigate(`/match/${matchId}`);
    } catch (error) {
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
    return (
      <main className="fixed inset-0 flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(234,36,112,0.15),transparent_34%),linear-gradient(180deg,#061124,#020816)] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-[2rem] border border-pink-400/45 bg-slate-950/85 px-7 py-8 text-center"
        >
          <p className="font-orbitron text-xs font-bold tracking-[0.32em] text-pink-300 uppercase">
            Match unavailable
          </p>
          <p className="mt-5 text-sm leading-relaxed text-white/72">{error}</p>
          <Button
            className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 text-cyan-100 uppercase"
            onClick={() => {
              setError(null);
              setReloadKey((value) => value + 1);
            }}
          >
            Retry match
          </Button>
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

  if (!match || !myTeam || !opponentTeam) return null;

  return (
    <div className="bg-overgoal-dark-blue h-full min-h-dvh w-full p-4">
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

          {legendProfile && legendPlayerId ? (
            <PreMatchLegend
              legendPlayerId={legendPlayerId}
              legendProfile={legendProfile}
            />
          ) : null}

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
                onClick={handleStartMatch}
                disabled={loading}
                aria-describedby={error ? "start-match-error" : undefined}
              >
                <p className="airstrike-normal !text-5xl text-white uppercase">
                  {loading ? "..." : error ? "Retry" : "Play"}
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
