import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

import preMatchBackground from "/backgrounds/glitch-bg.webp";

import playersData from "../../../../data/players.json";
import { BackButton } from "../../../components/ui/back-button";
import { Button } from "../../../components/ui/button";
import { Countdown } from "../../../components/ui/countdown";
import { GlitchText } from "../../../components/ui/glitch-text";
import { StaminaBar } from "../../../components/ui/stamina-bar";
import {
  createMatchCommand,
  fetchBackendMatch,
  startBackendMatch,
} from "../../../lib/backend-match";
import { useMatchSessionStore } from "../../../match/session-store";
import { cn } from "../../../utils/utils";
import useAppStore from "../../../zustand/store";
import CyberContainer from "../Home/components/cyber-container";
import SemiSquareContainer from "../Home/components/semi-square/semi-square-container";
import { SEASON_COUNTDOWN_TARGET_DATE } from "../Home/constants";
import teamsData from "../Seasons/components/teams.json";
import PreMatchTeam from "./components/pre-match-team";

function findClaimedPlayerTeam(claimedPlayerLinkId: string | null) {
  if (!claimedPlayerLinkId) return undefined;

  const claimedPlayer = playersData.find(
    (player) => player.linkID === claimedPlayerLinkId,
  );
  return teamsData.find((team) => team.id === claimedPlayer?.team_id);
}

export default function PreMatchScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const { claimedPlayerLinkId } = useAppStore();
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
  const playerTeam =
    teamsData.find((team) => team.name === myTeam?.name) ??
    findClaimedPlayerTeam(claimedPlayerLinkId) ??
    teamsData[3];
  const enemyTeam =
    teamsData.find((team) => team.name === opponentTeam?.name) ?? teamsData[0];

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

  const handleStartMatch = async () => {
    const matchId = match?.id || params.matchId;
    if (!matchId) return;

    let progressTimer: number | null = null;

    try {
      showTransitionLoader({
        title: "Starting Match",
        subtitle: "Connecting to the match engine.",
        progress: 12,
      });
      setLoading(true);
      setError(null);
      progressTimer = window.setInterval(() => {
        const currentProgress =
          useMatchSessionStore.getState().transitionLoader.progress;
        if (currentProgress >= 56) {
          return;
        }
        updateTransitionLoader({
          progress: Math.min(56, currentProgress + 4),
          subtitle: "Loading kickoff state and match timeline.",
        });
      }, 220);
      const matchSnapshot = match;
      if (!matchSnapshot) {
        throw new Error("Match state is unavailable. Reconnect and try again.");
      }
      const command =
        pendingCommand?.operation === "start" &&
        pendingCommand.matchId === matchId
          ? pendingCommand
          : createMatchCommand(
              "start",
              { match_id: matchId },
              { matchId, revision: matchSnapshot.revision ?? null },
            );
      beginStartCommand(command);
      const response = await startBackendMatch(matchSnapshot, command);
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      updateTransitionLoader({
        progress: 68,
        subtitle: "Syncing live events and player state.",
      });
      setStartResponse(response);
      updateTransitionLoader({
        progress: 84,
        subtitle: "Opening the live match feed.",
      });
      navigate(`/match/${matchId}`);
    } catch (error) {
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      const message =
        error instanceof Error ? error.message : "Failed to start match.";
      setError(message);
      setLoading(false);
      useMatchSessionStore.getState().hideTransitionLoader();
    }
  };

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
              teamName={playerTeam.name}
              teamImage={playerTeam.imageUrl}
              side="left"
              isMyTeam={true}
            />

            <span className="font-orbitron text-2xl font-bold text-white uppercase">
              vs
            </span>

            <PreMatchTeam
              teamName={enemyTeam.name}
              teamImage={enemyTeam.imageUrl}
              side="right"
              isMyTeam={false}
            />
          </div>

          <div className="border-overgoal-positive flex w-full flex-row items-center justify-between gap-4 border-1 bg-[#002601] p-2 text-center text-white">
            <img
              src="/logo.png"
              alt="stamina"
              className="h-16 w-16 object-cover"
            />
            <div className="flex h-10 w-full items-center justify-end">
              <CyberContainer className="!h-[65%] !w-full">
                <StaminaBar value={10} className="h-full w-full" />
              </CyberContainer>
            </div>
            <div className="flex flex-row gap-2">
              <SemiSquareContainer
                bgColor="#002601"
                noShadow={true}
                borderColor="var(--color-overgoal-positive)"
                className="h-10 w-10"
              >
                <div className="hidden">a</div>
              </SemiSquareContainer>
              <SemiSquareContainer
                bgColor="#002601"
                borderColor="var(--color-overgoal-positive)"
                noShadow={true}
                className="h-10 w-10"
              >
                <div className="hidden">a</div>
              </SemiSquareContainer>
              <SemiSquareContainer
                bgColor="#002601"
                borderColor="var(--color-overgoal-positive)"
                noShadow={true}
                className="h-10 w-10"
              >
                <div className="hidden">a</div>
              </SemiSquareContainer>
            </div>
          </div>

          <div className="mt-16 flex w-full items-center justify-center">
            <div
              className={cn(
                "z-100 h-full max-h-[73px] w-full max-w-[236px]",
                "flex items-center justify-center",
                "bg-[url('/homepage/play_button.svg')] bg-contain bg-center",
                "disabled:opacity-90",
                "bg-no-repeat",
              )}
            >
              {!import.meta.env.DEV &&
              !import.meta.env.VITE_E2E_LOCAL_CI_WALLETS ? (
                <div
                  className={cn(
                    "z-100 mt-2 flex h-full w-full flex-col items-center justify-center gap-2",
                    "flex items-center justify-center",
                  )}
                >
                  <GlitchText
                    text="Next Season Starts in:"
                    className="text-xl"
                  />
                  <Countdown
                    targetDate={SEASON_COUNTDOWN_TARGET_DATE}
                    className="text-overgoal-blue font-orbitron text-center text-3xl font-bold"
                    readyText="SEASON IS LIVE!"
                  />
                </div>
              ) : (
                <Button
                  className="h-full w-full"
                  onClick={handleStartMatch}
                  disabled={loading}
                >
                  <p className="airstrike-normal !text-5xl text-white uppercase">
                    {loading ? "..." : "Play"}
                  </p>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
