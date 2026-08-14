import { Loader2 } from "lucide-react";

import background from "/backgrounds/glitch-bg.webp";

import { GlitchText } from "../ui/glitch-text";

interface LoadingScreenProps {
  isLoading?: boolean;
  progress?: number;
  title?: string;
  detail?: string;
  label?: string;
}

export default function LoadingScreen({
  isLoading = true,
  progress = 0,
  title = "Loading",
  detail = "Preparing Overgoal",
  label = "Loading Overgoal",
}: LoadingScreenProps) {
  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="overgoal-safe-screen fixed inset-0 z-[190] flex min-h-dvh w-full flex-col items-center justify-center gap-4 overflow-hidden bg-[#020816] text-white transition-opacity duration-300 [--overgoal-safe-bottom-min:1.5rem] [--overgoal-safe-inline-min:1.5rem] [--overgoal-safe-top-min:1.5rem]"
    >
      <img
        loading="eager"
        fetchPriority="high"
        src={background}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-25 saturate-75"
        width={1000}
        height={1000}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(0,228,232,0.18),transparent_34%),linear-gradient(180deg,rgba(1,22,39,0.72),rgba(2,8,22,0.96))]" />
      <div className="relative z-10 w-full max-w-sm rounded-[2rem] border border-cyan-300/30 bg-slate-950/76 px-7 py-8 text-center shadow-[0_0_48px_rgba(0,228,232,0.13)] backdrop-blur-md">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-300" />
        <GlitchText className="mt-5 text-3xl text-white" text={title} />
        <p className="mt-3 text-sm font-medium text-cyan-50/70">{detail}</p>
        {progress > 0 && (
          <div className="mt-6 w-full">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-2.5 w-full overflow-hidden rounded-full border border-cyan-300/15 bg-white/10"
            >
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 via-teal-300 to-emerald-300 shadow-[0_0_12px_rgba(0,228,232,0.4)] transition-all duration-300"
                style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs font-bold tracking-[0.2em] text-cyan-100/70">
              {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
