import { Link, useParams } from "react-router";

import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

export default function TournamentScreen() {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  // Mock data - in a real app this would come from an API
  const tournament = {
    id: tournamentId,
    name: "Champions League",
    type: "International",
    prizePool: 1000000,
    participants: 32,
    currentRound: "Round of 16",
    status: "ongoing",
    startDate: "2024-02-01",
    endDate: "2024-05-30",
    description: "The most prestigious club competition in European football.",
    winner: null,
    finalist: null,
  };

  const rounds = [
    { name: "Group Stage", completed: true, teams: 32, matches: 96 },
    { name: "Round of 16", completed: false, teams: 16, matches: 16 },
    { name: "Quarter Finals", completed: false, teams: 8, matches: 8 },
    { name: "Semi Finals", completed: false, teams: 4, matches: 4 },
    { name: "Final", completed: false, teams: 2, matches: 1 },
  ];

  const topScorers = [
    { name: "Kylian Mbappe", team: "PSG", goals: 8, assists: 3 },
    { name: "Erling Haaland", team: "Man City", goals: 7, assists: 2 },
    { name: "Lionel Messi", team: "Inter Miami", goals: 6, assists: 5 },
    { name: "Robert Lewandowski", team: "Barcelona", goals: 6, assists: 1 },
    { name: "Harry Kane", team: "Bayern Munich", goals: 5, assists: 4 },
  ];

  const upcomingMatches = [
    {
      id: 1,
      homeTeam: "Real Madrid",
      awayTeam: "Manchester City",
      date: "2024-03-25",
      time: "21:00",
    },
    {
      id: 2,
      homeTeam: "Barcelona",
      awayTeam: "PSG",
      date: "2024-03-26",
      time: "21:00",
    },
    {
      id: 3,
      homeTeam: "Bayern Munich",
      awayTeam: "Arsenal",
      date: "2024-03-27",
      time: "21:00",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mt-8">
          <div className="mb-6">
            <Link to="/tournaments">
              <Button variant="outline" className="mb-4">
                ← Back to Tournaments
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
            <p className="mt-2 text-slate-300">{tournament.description}</p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">
                Prize Pool
              </h3>
              <div className="text-2xl font-bold text-yellow-400">
                ${tournament.prizePool.toLocaleString()}
              </div>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">
                Participants
              </h3>
              <div className="text-2xl font-bold text-white">
                {tournament.participants}
              </div>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">
                Current Round
              </h3>
              <div className="text-lg font-bold text-blue-400">
                {tournament.currentRound}
              </div>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">Status</h3>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium text-white ${
                  tournament.status === "ongoing"
                    ? "bg-green-600"
                    : tournament.status === "completed"
                      ? "bg-blue-600"
                      : "bg-yellow-600"
                }`}
              >
                {tournament.status.charAt(0).toUpperCase() +
                  tournament.status.slice(1)}
              </span>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Tournament Bracket/Rounds */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Tournament Progress
              </h2>
              <div className="space-y-3">
                {rounds.map((round, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-3 ${
                      round.completed
                        ? "border-green-700 bg-green-900/20"
                        : round.name === tournament.currentRound
                          ? "border-blue-700 bg-blue-900/20"
                          : "border-slate-600 bg-slate-700/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3
                          className={`font-medium ${
                            round.completed
                              ? "text-green-400"
                              : round.name === tournament.currentRound
                                ? "text-blue-400"
                                : "text-slate-400"
                          }`}
                        >
                          {round.name}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {round.teams} teams • {round.matches} matches
                        </p>
                      </div>
                      {round.completed && (
                        <div className="h-2 w-2 rounded-full bg-green-400"></div>
                      )}
                      {round.name === tournament.currentRound && (
                        <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Scorers */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Top Scorers
              </h2>
              <div className="space-y-3">
                {topScorers.map((player, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-slate-700/30 p-2"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="w-6 font-bold text-slate-400">
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-white">
                          {player.name}
                        </div>
                        <div className="text-sm text-slate-400">
                          {player.team}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold text-yellow-400">
                        {player.goals}G
                      </div>
                      <div className="text-blue-400">{player.assists}A</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Upcoming Matches */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Upcoming Matches
              </h2>
              <div className="space-y-3">
                {upcomingMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-lg bg-slate-700/30 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-slate-300">
                        {match.date}
                      </span>
                      <span className="text-sm text-blue-400">
                        {match.time}
                      </span>
                    </div>
                    <div className="text-center text-sm text-white">
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {tournament.status === "completed" && tournament.winner && (
            <Card className="mt-8 border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Tournament Winner
              </h2>
              <div className="text-center">
                <div className="mb-2 text-4xl">🏆</div>
                <h3 className="text-2xl font-bold text-yellow-400">
                  {tournament.winner}
                </h3>
                {tournament.finalist && (
                  <p className="text-slate-300">vs {tournament.finalist}</p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
