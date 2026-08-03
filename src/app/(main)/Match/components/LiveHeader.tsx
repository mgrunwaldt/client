import React from "react";

import { GlitchText } from "../../../../components/ui/glitch-text";

interface LiveHeaderProps {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  time: number; // in minutes
}

export const LiveHeader: React.FC<LiveHeaderProps> = ({
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  time,
}) => {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      {/* LIVE Indicator */}
      <div className="mr-6 flex items-center justify-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
        <GlitchText text="LIVE" className="text-3xl" />
      </div>

      {/* Scoreboard Container */}
      <div className="relative flex w-full max-w-2xl items-center justify-center rounded-xl p-8">
        {/* Neon Border Effect */}
        <div className="bg-linear-to-r absolute inset-0 -z-10 rounded-xl via-transparent opacity-50" />

        {/* Score & Timer */}
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-row items-center justify-end gap-4">
            <div className="flex flex-col items-center justify-center gap-1">
              <img src="/teams/dojoUnited.webp" alt="" className="h-14 w-14" />
              <span className="font-orbitron text-overgoal-lime-green whitespace-normal text-center text-sm uppercase leading-none">
                {homeTeamName}
              </span>
            </div>
            <span className="font-orbitron mt-auto text-2xl font-bold tabular-nums text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {homeScore}
            </span>
          </div>

          {/* Timer Box */}
          <div className="flex h-16 w-24 flex-none items-center justify-center bg-[url('/assets/ui/timer-bg.svg')] bg-contain bg-center bg-no-repeat">
            <div className="flex w-20 justify-center rounded-lg border-2 border-cyan-500/50 bg-black/60 py-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="font-orbitron text-2xl font-bold tabular-nums text-white">
                {time.toString().padStart(2, "0")}'
              </span>
            </div>
          </div>

          <div className="flex flex-row items-center justify-start gap-4">
            <span className="font-orbitron mt-auto text-2xl font-bold tabular-nums text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {awayScore}
            </span>
            <div className="flex flex-col items-center justify-center gap-1">
              <img
                src="/teams/Cartridge City.webp"
                alt=""
                className="h-14 w-14"
              />
              <span className="font-orbitron text-overgoal-error whitespace-normal text-center text-sm uppercase leading-none">
                {awayTeamName}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
