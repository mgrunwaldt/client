import { useRef } from "react";
import { useNavigate } from "react-router";

import { Button } from "../../../../components/ui/button";
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
import { HOME_MENU_ITEMS } from "../constants";
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
  const createLock = useRef(false);
  const setCreatedMatch = useMatchSessionStore(
    (state) => state.setCreatedMatch,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const beginCreateCommand = useMatchSessionStore(
    (state) => state.beginCreateCommand,
  );

  const handleCreateMatch = async () => {
    if (createLock.current) return;
    createLock.current = true;

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
      if (!beginCreateCommand(command)) {
        setLoading(false);
        createLock.current = false;
        return;
      }
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
      createLock.current = false;
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
        <Button
          className="h-full w-full"
          onClick={handleCreateMatch}
          disabled={loading}
          aria-describedby={error ? "create-match-error" : undefined}
        >
          <p className="airstrike-normal !text-5xl text-white uppercase">
            {loading ? "..." : error ? "Retry" : "Play"}
          </p>
        </Button>
      </div>
      {error ? (
        <p
          id="create-match-error"
          role="alert"
          className="absolute -top-14 left-1/2 z-[110] w-[88%] -translate-x-1/2 rounded-xl border border-pink-400/50 bg-slate-950/92 px-3 py-2 text-center text-xs font-medium text-pink-100 shadow-[0_0_20px_rgba(234,36,112,0.16)]"
        >
          {error}
        </p>
      ) : null}
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
