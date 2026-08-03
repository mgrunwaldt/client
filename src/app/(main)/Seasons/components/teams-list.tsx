import SeasonTeamItem from "./team-item";
import teamsData from "./teams.json";

export type SeasonTeam = {
  id: number;
  name: string;
  imageUrl: string;
};
type SeasonTeamsListProps = {
  teams?: SeasonTeam[];
};

export default function TeamsList({ teams = teamsData }: SeasonTeamsListProps) {
  return (
    <div className="pb-30 flex w-full flex-col items-center justify-center gap-4">
      {teams.map((team, index) => (
        <SeasonTeamItem key={team.id} {...team} index={index + 1} />
      ))}
    </div>
  );
}
