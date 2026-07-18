import { Header } from "../../../components/header";
import { Card } from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import { LoginPlayer } from "../../(login)/Login/components/login-player";

export default function CareerScreen() {
  const careerStats = {
    level: 15,
    experience: 2450,
    nextLevelExp: 3000,
    totalMatches: 127,
    wins: 89,
    draws: 12,
    losses: 26,
    winRate: 70,
  };

  const achievements = [
    {
      id: 1,
      name: "First Win",
      description: "Won your first match",
      unlocked: true,
    },
    {
      id: 2,
      name: "Hat Trick",
      description: "Score 3 goals in one match",
      unlocked: true,
    },
    {
      id: 3,
      name: "Champion",
      description: "Win a tournament",
      unlocked: false,
    },
    { id: 4, name: "Legend", description: "Reach level 50", unlocked: false },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Header />
        <LoginPlayer />

        <div className="mt-8">
          <h1 className="mb-6 text-3xl font-bold text-white">Career</h1>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Career Stats */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Career Stats
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Level</span>
                  <span className="font-bold text-white">
                    {careerStats.level}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Experience</span>
                    <span className="text-white">
                      {careerStats.experience}/{careerStats.nextLevelExp}
                    </span>
                  </div>
                  <Progress
                    value={
                      (careerStats.experience / careerStats.nextLevelExp) * 100
                    }
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {careerStats.wins}
                    </div>
                    <div className="text-sm text-slate-400">Wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {careerStats.draws}
                    </div>
                    <div className="text-sm text-slate-400">Draws</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {careerStats.losses}
                    </div>
                    <div className="text-sm text-slate-400">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {careerStats.winRate}%
                    </div>
                    <div className="text-sm text-slate-400">Win Rate</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Achievements */}
            <Card className="border-slate-700 bg-slate-800/50 p-6">
              <h2 className="mb-4 text-2xl font-semibold text-white">
                Achievements
              </h2>
              <div className="space-y-3">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={`rounded-lg border p-3 ${
                      achievement.unlocked
                        ? "border-green-700 bg-green-900/20"
                        : "border-slate-600 bg-slate-700/20"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`h-4 w-4 rounded-full ${
                          achievement.unlocked ? "bg-green-400" : "bg-slate-500"
                        }`}
                      />
                      <div>
                        <h3
                          className={`font-medium ${
                            achievement.unlocked
                              ? "text-white"
                              : "text-slate-400"
                          }`}
                        >
                          {achievement.name}
                        </h3>
                        <p className="text-sm text-slate-400">
                          {achievement.description}
                        </p>
                      </div>
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
