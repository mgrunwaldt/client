import { Link, useParams } from "react-router";

import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

export default function SeasonScreen() {
  const { seasonId } = useParams<{ seasonId: string }>();

  // Mock data - in a real app this would come from an API
  const season = {
    id: seasonId,
    name: `Season ${seasonId}`,
    status: "active",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    description:
      "The current season with exciting tournaments and competitions.",
    totalClubs: 25,
    totalPlayers: 1250,
    currentWeek: 12,
    totalWeeks: 52,
  };

  const topClubs = [
    { id: 1, name: "FC Barcelona", points: 28, wins: 9, draws: 1, losses: 2 },
    { id: 2, name: "Real Madrid", points: 26, wins: 8, draws: 2, losses: 2 },
    {
      id: 3,
      name: "Manchester City",
      points: 24,
      wins: 7,
      draws: 3,
      losses: 2,
    },
    { id: 4, name: "Liverpool FC", points: 22, wins: 7, draws: 1, losses: 4 },
    { id: 5, name: "Bayern Munich", points: 20, wins: 6, draws: 2, losses: 4 },
  ];

  const recentMatches = [
    {
      id: 1,
      homeTeam: "FC Barcelona",
      awayTeam: "Real Madrid",
      score: "2-1",
      date: "2024-03-20",
    },
    {
      id: 2,
      homeTeam: "Manchester City",
      awayTeam: "Liverpool FC",
      score: "3-1",
      date: "2024-03-19",
    },
    {
      id: 3,
      homeTeam: "Bayern Munich",
      awayTeam: "PSG",
      score: "1-1",
      date: "2024-03-18",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mt-8">
          <div className="mb-6">
            <Link to="/seasons">
              <Button variant="outline" className="mb-4">
                ← Back to Seasons
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-white">{season.name}</h1>
            <p className="mt-2 text-slate-300">{season.description}</p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">
                Season Progress
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Week</span>
                  <span className="text-white">
                    {season.currentWeek}/{season.totalWeeks}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-700">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{
                      width: `${(season.currentWeek / season.totalWeeks) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">
                Statistics
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Clubs</span>
                  <span className="text-white">{season.totalClubs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Players</span>
                  <span className="text-white">
                    {season.totalPlayers.toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-white">Status</h3>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium text-white ${
                  season.status === "active" ? "bg-green-600" : "bg-blue-600"
                }`}
              >
                {season.status.charAt(0).toUpperCase() + season.status.slice(1)}
              </span>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* League Table */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                League Table
              </h2>
              <div className="space-y-2">
                {topClubs.map((club, index) => (
                  <Link
                    key={club.id}
                    to={`/season-club/${seasonId}/${club.id}`}
                  >
                    <div className="flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-700/50">
                      <div className="flex items-center space-x-4">
                        <span className="w-6 font-bold text-slate-400">
                          {index + 1}
                        </span>
                        <span className="font-medium text-white">
                          {club.name}
                        </span>
                      </div>
                      <div className="flex items-center space-x-6 text-sm">
                        <span className="text-slate-400">
                          {club.points} pts
                        </span>
                        <span className="text-slate-500">
                          {club.wins}-{club.draws}-{club.losses}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            {/* Recent Matches */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Recent Matches
              </h2>
              <div className="space-y-3">
                {recentMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-lg bg-slate-700/30 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm text-slate-300">
                        {match.date}
                      </span>
                      <span className="font-bold text-white">
                        {match.score}
                      </span>
                    </div>
                    <div className="text-sm text-white">
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
