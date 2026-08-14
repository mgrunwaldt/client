import React from "react";

import { GlitchText } from "../../../../components/ui/glitch-text";
import { cn } from "../../../../utils/utils";

interface LiveHeaderProps {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  time: number; // in minutes
  scoreChange?: {
    side: "home" | "away";
    eventId: string;
  } | null;
}

export const LiveHeader: React.FC<LiveHeaderProps> = ({
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  time,
  scoreChange = null,
}) => {
  return (
    <header className="flex w-full flex-col items-center justify-center">
      <div className="flex items-center justify-center gap-2">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.65)]" />
        <GlitchText text="LIVE" className="text-2xl" />
      </div>

      <div className="relative flex w-full max-w-2xl items-center justify-center rounded-xl px-1 py-2">
        <div className="absolute inset-0 -z-10 rounded-xl bg-linear-to-r via-transparent opacity-50" />

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div
            data-score-event-id={
              scoreChange?.side === "home" ? scoreChange.eventId : undefined
            }
            className="flex min-w-0 flex-row items-center justify-end gap-2"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <img src="/teams/dojoUnited.webp" alt="" className="h-11 w-11" />
              <span className="font-orbitron text-overgoal-lime-green line-clamp-2 max-w-20 text-center text-[10px] leading-none uppercase">
                {homeTeamName}
              </span>
            </div>
            <span
              key={`home-${homeScore}`}
              data-testid="home-score"
              aria-live="polite"
              className={cn(
                "font-orbitron text-2xl font-bold text-white tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]",
                scoreChange?.side === "home" && "score-event-pulse-team",
              )}
            >
              {homeScore}
            </span>
          </div>

          <div className="flex h-14 w-20 flex-none items-center justify-center bg-[url('/assets/ui/timer-bg.svg')] bg-contain bg-center bg-no-repeat">
            <div className="flex w-16 justify-center rounded-lg border-2 border-cyan-500/50 bg-black/60 py-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="font-orbitron text-xl font-bold text-white tabular-nums">
                {time.toString().padStart(2, "0")}'
              </span>
            </div>
          </div>

          <div
            data-score-event-id={
              scoreChange?.side === "away" ? scoreChange.eventId : undefined
            }
            className="flex min-w-0 flex-row items-center justify-start gap-2"
          >
            <span
              key={`away-${awayScore}`}
              data-testid="away-score"
              aria-live="polite"
              className={cn(
                "font-orbitron text-2xl font-bold text-white tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]",
                scoreChange?.side === "away" && "score-event-pulse-opponent",
              )}
            >
              {awayScore}
            </span>
            <div className="flex flex-col items-center justify-center gap-1">
              <img
                src="/teams/Cartridge City.webp"
                alt=""
                className="h-11 w-11"
              />
              <span className="font-orbitron text-overgoal-error line-clamp-2 max-w-20 text-center text-[10px] leading-none uppercase">
                {awayTeamName}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
