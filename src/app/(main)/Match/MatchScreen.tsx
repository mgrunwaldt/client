import "../../(game)/field-assets";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { Button } from "../../../components/ui/button";
import { fetchBackendMatch } from "../../../lib/backend-match";
import { hasAuthoritativeTimelineState } from "../../../match/authoritative-route-state";
import { useMatchSessionStore } from "../../../match/session-store";
import { EventFeed } from "./components/EventFeed";
import { LiveHeader } from "./components/LiveHeader";
import { MatchControls } from "./components/MatchControls";

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
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const hideTransitionLoader = useMatchSessionStore(
    (state) => state.hideTransitionLoader,
  );
  const fieldTransitionTimeout = useRef<number | null>(null);
  const authoritativeTimelineReady = hasAuthoritativeTimelineState({
    routeMatchId: params.matchId,
    match,
    myTeam,
    opponentTeam,
  });

  const targetMinute = pendingAction?.minute || match?.current_time || 0;

  useEffect(() => {
    const matchId = params.matchId;
    if (!matchId || authoritativeTimelineReady) {
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
        hideTransitionLoader();
      }
    };

    void loadMatch();

    return () => {
      cancelled = true;
    };
  }, [
    authoritativeTimelineReady,
    hideTransitionLoader,
    hydrateMatchSession,
    params.matchId,
    reloadKey,
    setError,
    setLoading,
  ]);

  useEffect(() => {
    if (!match?.id || !params.matchId || match.id !== params.matchId) {
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
  }, [hideTransitionLoader, match?.id, params.matchId, updateTransitionLoader]);

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
    if (phase !== "scene_ready") {
      return;
    }

    fieldTransitionTimeout.current = window.setTimeout(() => {
      navigate("/game");
    }, 2000);

    return () => {
      if (fieldTransitionTimeout.current) {
        window.clearTimeout(fieldTransitionTimeout.current);
      }
    };
  }, [navigate, phase]);

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

  if (!authoritativeTimelineReady && !error) {
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
    return (
      <main className="fixed inset-0 flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(234,36,112,0.15),transparent_34%),linear-gradient(180deg,#061124,#020816)] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-[2rem] border border-pink-400/45 bg-slate-950/85 px-7 py-8 text-center"
        >
          <p className="font-orbitron text-xs font-bold tracking-[0.32em] text-pink-300 uppercase">
            Live match unavailable
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
    <div className="flex h-dvh w-full flex-col items-center overflow-hidden bg-[url('/backgrounds/glitch-bg.webp')] bg-center bg-no-repeat p-4 text-white">
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
          <MatchControls
            effort={effort}
            setEffort={setEffort}
            playstyle={playstyle}
            setPlaystyle={setPlaystyle}
          />
        </div>
      </div>
    </div>
  );
}
