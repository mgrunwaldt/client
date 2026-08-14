import React, { useState } from "react";

import { cn } from "../../../../utils/utils";

type EffortLevel = "low" | "medium" | "high";
type Playstyle = "defense" | "balanced" | "offensive";
type TacticSelector = "effort" | "playstyle";

interface MatchControlsProps {
  effort: EffortLevel;
  setEffort: (effort: EffortLevel) => void;
  playstyle: Playstyle;
  setPlaystyle: (style: Playstyle) => void;
  disabled?: boolean;
  syncing?: boolean;
  error?: string | null;
}

const effortOptions = [
  { icon: "/icons/Low.webp", label: "Low", value: "low" },
  { icon: "/icons/Medium.webp", label: "Medium", value: "medium" },
  { icon: "/icons/High.png", label: "High", value: "high" },
] as const;

const playstyleOptions = [
  { icon: "/icons/Defense.webp", label: "Defense", value: "defense" },
  { icon: "/icons/Balanced.webp", label: "Balanced", value: "balanced" },
  { icon: "/icons/Offense.png", label: "Offensive", value: "offensive" },
] as const;

const optionClass = (selected: boolean) =>
  cn(
    "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border px-1 transition-[border-color,background-color,box-shadow]",
    selected
      ? "border-cyan-200 bg-cyan-300/18 text-white shadow-[inset_0_0_14px_rgba(34,211,238,0.18),0_0_12px_rgba(34,211,238,0.2)]"
      : "border-white/10 bg-[#020b1c]/96 text-cyan-100/70",
  );

export const MatchControls: React.FC<MatchControlsProps> = ({
  effort,
  setEffort,
  playstyle,
  setPlaystyle,
  disabled = false,
  syncing = false,
  error = null,
}) => {
  const [openSelector, setOpenSelector] = useState<TacticSelector | null>(null);
  const effortOption =
    effortOptions.find((option) => option.value === effort) ?? effortOptions[1];
  const playstyleOption =
    playstyleOptions.find((option) => option.value === playstyle) ??
    playstyleOptions[1];
  const visibleOptions =
    openSelector === "effort" ? effortOptions : playstyleOptions;

  const selectOption = (value: string) => {
    if (openSelector === "effort") setEffort(value as EffortLevel);
    if (openSelector === "playstyle") setPlaystyle(value as Playstyle);
    setOpenSelector(null);
  };

  return (
    <div
      aria-busy={syncing}
      data-testid="match-tactics-controls"
      className="relative mx-auto w-full max-w-2xl"
    >
      {error && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-[calc(100%+0.4rem)] z-30 rounded-xl border border-pink-300/35 bg-pink-950/95 px-3 py-2 text-center text-xs text-pink-100 shadow-lg"
        >
          {error}
        </div>
      )}

      {openSelector && (
        <div
          id={`${openSelector}-options`}
          role="group"
          aria-label={`Choose ${openSelector}`}
          data-testid="tactics-option-drawer"
          className="absolute inset-x-0 bottom-[calc(100%+0.45rem)] z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-cyan-300/45 bg-[#010817]/96 p-2 shadow-[0_0_28px_rgba(34,211,238,0.22)] backdrop-blur-md"
        >
          {visibleOptions.map((option) => {
            const selected =
              openSelector === "effort"
                ? effort === option.value
                : playstyle === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-label={option.label}
                aria-pressed={selected}
                onClick={() => selectOption(option.value)}
                className={optionClass(selected)}
              >
                <img src={option.icon} alt="" className="h-5 w-5 shrink-0" />
                <span className="font-orbitron text-[8px] font-bold uppercase">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={openSelector === "effort"}
          aria-controls="effort-options"
          onClick={() =>
            setOpenSelector((current) =>
              current === "effort" ? null : "effort",
            )
          }
          className="flex min-h-12 min-w-0 items-center gap-2 rounded-2xl border border-cyan-400/30 bg-[#020b1c]/90 px-2 text-left shadow-[inset_0_0_18px_rgba(34,211,238,0.05)]"
        >
          <img
            src={effortOption.icon}
            alt=""
            className={cn("h-7 w-7 shrink-0", syncing && "animate-pulse")}
          />
          <span className="min-w-0">
            <span className="font-orbitron block text-[8px] tracking-[0.2em] text-cyan-300/60 uppercase">
              Effort
            </span>
            <span
              data-testid="current-effort"
              className="font-orbitron block truncate text-[11px] font-bold text-cyan-100 uppercase"
            >
              {effortOption.label}
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-expanded={openSelector === "playstyle"}
          aria-controls="playstyle-options"
          onClick={() =>
            setOpenSelector((current) =>
              current === "playstyle" ? null : "playstyle",
            )
          }
          className="flex min-h-12 min-w-0 items-center gap-2 rounded-2xl border border-cyan-400/30 bg-[#020b1c]/90 px-2 text-left shadow-[inset_0_0_18px_rgba(34,211,238,0.05)]"
        >
          <img
            src={playstyleOption.icon}
            alt=""
            className={cn("h-7 w-7 shrink-0", syncing && "animate-pulse")}
          />
          <span className="min-w-0">
            <span className="font-orbitron block text-[8px] tracking-[0.2em] text-cyan-300/60 uppercase">
              Playstyle
            </span>
            <span
              data-testid="current-playstyle"
              className="font-orbitron block truncate text-[11px] font-bold text-cyan-100 uppercase"
            >
              {playstyleOption.label}
            </span>
          </span>
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {syncing ? "Tactics syncing" : "Tactics synchronized"}
      </span>
    </div>
  );
};
