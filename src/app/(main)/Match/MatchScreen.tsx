import "../../(game)/field-assets";

import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router";

import { fetchBackendMatch } from "../../../lib/backend-match";
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
  const setPlaybackStatus = useMatchSessionStore(
    (state) => state.setPlaybackStatus,
  );
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const hideTransitionLoader = useMatchSessionStore(
    (state) => state.hideTransitionLoader,
  );
  const fieldTransitionTimeout = useRef<number | null>(null);

  const targetMinute = pendingAction?.minute || match?.current_time || 0;

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
        hydrateMatchSession({
          match: response.match,
          myTeam: response.my_team,
          opponentTeam: response.opponent_team,
          timelineEvents: response.timeline,
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load match.";
        setError(message);
        setLoading(false);
      }
    };

    void loadMatch();

    return () => {
      cancelled = true;
    };
  }, [hydrateMatchSession, match?.id, params.matchId, setError, setLoading]);

  useEffect(() => {
    if (!match?.id || !params.matchId || match.id !== params.matchId) {
      return;
    }

    updateTransitionLoader({
      progress: 100,
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
      if (pendingAction) {
        setPlaybackStatus("timeline_ready_for_field");
      } else {
        setPlaybackStatus("idle");
      }
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
    setPlaybackStatus,
    targetMinute,
  ]);

  useEffect(() => {
    if (playbackStatus !== "timeline_ready_for_field") {
      return;
    }

    fieldTransitionTimeout.current = window.setTimeout(() => {
      setPlaybackStatus("field_ready");
      navigate("/game");
    }, 2000);

    return () => {
      if (fieldTransitionTimeout.current) {
        window.clearTimeout(fieldTransitionTimeout.current);
      }
    };
  }, [navigate, playbackStatus, setPlaybackStatus]);

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
  const homeScore = lastScoreEvent?.my_team_score ?? 0;
  const awayScore = lastScoreEvent?.opponent_team_score ?? 0;

  return (
    <div className="flex h-dvh w-full flex-col items-center overflow-hidden bg-[url('/backgrounds/glitch-bg.webp')] bg-center bg-no-repeat p-4 text-white">
      <div className="z-10 flex h-full w-full max-w-4xl flex-col items-center justify-between gap-4 pb-4">
        <div className="flex min-h-0 w-full shrink flex-col items-center justify-center rounded-2xl">
          <LiveHeader
            homeTeamName={myTeam?.name || "Dojo United"}
            awayTeamName={opponentTeam?.name || "Cartridge City"}
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
