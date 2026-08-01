import { useNavigate } from "react-router";

import { Button } from "../../../../components/ui/button";
import { Countdown } from "../../../../components/ui/countdown";
import {
  type BackendTeam,
  createBackendMatch,
  createMatchCommand,
  defaultLegendProfile,
  fetchBackendTeams,
} from "../../../../lib/backend-match";
import { useMatchSessionStore } from "../../../../match/session-store";
import { cn } from "../../../../utils/utils";
import { getIcon } from "../../../../utils/utils";
import teamsData from "../../Seasons/components/teams.json";
import { HOME_MENU_ITEMS, SEASON_COUNTDOWN_TARGET_DATE } from "../constants";
import MenuItem from "./menu-item";

function pickTeams(backendTeams: BackendTeam[]) {
  const preferredHomeName = "Dojo United";
  const preferredAwayName = "Cartridge City";
  const localHomeTeam = teamsData.find(
    (team) => team.name === preferredHomeName,
  );
  const homeTeam =
    backendTeams.find((team) => team.name === localHomeTeam?.name) ||
    backendTeams.find((team) => team.name === preferredHomeName) ||
    backendTeams[0];
  const awayTeam =
    backendTeams.find(
      (team) => team.name === preferredAwayName && team.id !== homeTeam?.id,
    ) ||
    backendTeams.find((team) => team.id !== homeTeam?.id) ||
    backendTeams[1];

  return { homeTeam, awayTeam };
}

export default function MenuFooter() {
  const navigate = useNavigate();
  const setCreatedMatch = useMatchSessionStore(
    (state) => state.setCreatedMatch,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const loading = useMatchSessionStore((state) => state.loading);
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const beginCreateCommand = useMatchSessionStore(
    (state) => state.beginCreateCommand,
  );

  const handleCreateMatch = async () => {
    try {
      setLoading(true);
      setError(null);
      const backendTeams = await fetchBackendTeams();
      const { homeTeam, awayTeam } = pickTeams(backendTeams);

      if (!homeTeam || !awayTeam) {
        throw new Error("Could not select backend teams for match creation.");
      }

      const body = {
        my_team_id: homeTeam.id,
        opponent_team_id: awayTeam.id,
        player_profile: defaultLegendProfile(),
        ruleset: { rebound_play_enabled: true },
      };
      const command =
        pendingCommand?.operation === "create"
          ? pendingCommand
          : createMatchCommand("create", body);
      if (!beginCreateCommand(command)) return;
      const created = await createBackendMatch(body, command);

      setCreatedMatch({
        match: created.match,
        myTeam: created.my_team,
        opponentTeam: created.opponent_team,
      });
      navigate(`/pre-match/${created.match.id}`);
    } catch (error) {
      setError(error);
      setLoading(false);
    }
  };

  return (
    <div className="home-footer relative h-full max-h-[175px] w-full bg-black">
      <div
        className={cn(
          "absolute -top-3 left-1/2 z-100 h-full max-h-[73px] w-full max-w-[236px] -translate-x-1/2",
          "flex items-center justify-center",
          "bg-[url('/homepage/play_button.svg')] bg-contain bg-center",
          "disabled:opacity-90",
        )}
      >
        {!import.meta.env.DEV && !import.meta.env.VITE_E2E_LOCAL_CI_WALLETS ? (
          <div className="flex flex-col items-center justify-center">
            <span className="font-orbitron text-base text-white">
              Season 0 Starts:
            </span>
            <Countdown
              targetDate={SEASON_COUNTDOWN_TARGET_DATE}
              className="text-overgoal-blue font-orbitron text-center text-xl font-bold"
              readyText="SEASON IS LIVE!"
            />
          </div>
        ) : (
          <Button
            className="h-full w-full"
            onClick={handleCreateMatch}
            disabled={loading}
          >
            <p className="airstrike-normal !text-5xl text-white uppercase">
              {loading ? "..." : "Play"}
            </p>
          </Button>
        )}
      </div>
      <div className="relative flex h-full w-full flex-row items-end justify-center gap-8 p-4 text-white">
        {HOME_MENU_ITEMS.map((item) => (
          <MenuItem
            key={item.title}
            title={item.title}
            icon={getIcon(item.iconName)}
            href={item.href}
            disabled={item.disabled}
          />
        ))}
      </div>
    </div>
  );
}
