import glitchBackground from "/backgrounds/glitch-bg.webp";

import { GlitchText } from "../components/ui/glitch-text";
import { useMatchSessionStore } from "./session-store";

function normalizedProgress(progress: number) {
  return Math.max(6, Math.min(100, progress));
}

export default function MatchTransitionLoader() {
  const loader = useMatchSessionStore((state) => state.transitionLoader);

  if (!loader.visible) {
    return null;
  }

  const progress = normalizedProgress(loader.progress);

  return (
    <div
      data-testid="match-start-transition"
      role="status"
      aria-live="polite"
      aria-label={`${loader.stage}: ${loader.subtitle}`}
      className="fixed inset-0 z-[200] overflow-hidden bg-[#020816] text-white"
    >
      <img
        src={glitchBackground}
        alt="transition background"
        className="absolute inset-0 h-full w-full object-cover opacity-18 saturate-75"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(34,211,238,0.14),transparent_28%),linear-gradient(180deg,rgba(8,17,40,0.72),rgba(2,8,22,0.96))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-cyan-300/0 via-cyan-300/55 to-cyan-300/0" />
      <div className="absolute inset-y-[10%] left-[5%] w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/28 to-cyan-300/0" />
      <div className="absolute inset-y-[10%] right-[5%] w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/28 to-cyan-300/0" />

      <div className="absolute inset-x-[11%] top-[10%] h-[17%] rounded-b-[2.5rem] border-[3px] border-t-0 border-cyan-300/30 shadow-[0_0_28px_rgba(34,211,238,0.08)]" />
      <div className="absolute top-[6.2%] left-1/2 h-[4.6%] w-[46%] -translate-x-1/2 rounded-[0.35rem] border-[5px] border-slate-200/70 bg-slate-300/18 shadow-[0_0_16px_rgba(255,255,255,0.08)]" />
      <div className="absolute top-[12.9%] left-1/2 h-px w-[60%] -translate-x-1/2 bg-linear-to-r from-cyan-300/0 via-cyan-300/22 to-cyan-300/0" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 pt-[20vh] pb-[12vh]">
        <div className="transition-loader-shell transition-loader-glow relative w-full max-w-[27rem] rounded-[2.25rem] border border-cyan-300/34 bg-[linear-gradient(180deg,rgba(4,14,34,0.88),rgba(1,7,22,0.96))] px-6 pt-7 pb-6 shadow-[0_0_55px_rgba(12,160,200,0.15),inset_0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-md">
          <div className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-cyan-300/0 via-cyan-300/48 to-cyan-300/0" />
          <div className="absolute top-[8%] left-[8%] h-[1px] w-[18%] bg-cyan-300/18" />
          <div className="absolute top-[8%] right-[8%] h-[1px] w-[18%] bg-cyan-300/18" />

          <div className="mb-5 text-center">
            <p className="text-[10px] font-bold tracking-[0.42em] text-cyan-300/82 uppercase">
              Match Day
            </p>
            <div className="mt-3 flex justify-center">
              <div className="max-w-[13rem]">
                <GlitchText
                  className="text-center text-[2.35rem] leading-[0.82] text-white"
                  text={loader.title}
                />
              </div>
            </div>
            <p className="mx-auto mt-5 max-w-[16rem] text-center text-[0.95rem] leading-snug font-medium text-cyan-50/82">
              {loader.subtitle}
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-cyan-300/28 bg-[linear-gradient(180deg,rgba(5,18,36,0.88),rgba(3,12,24,0.96))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_24px_rgba(5,122,166,0.08)]">
            <div className="mb-3 flex items-center justify-between text-[11px] font-bold tracking-[0.26em] text-cyan-100/78 uppercase">
              <span>{loader.stage}</span>
              <span>{Math.round(progress)}%</span>
            </div>

            <div
              role="progressbar"
              aria-label={loader.stage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="relative h-3.5 overflow-hidden rounded-full border border-cyan-300/14 bg-white/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
            >
              <div
                className="transition-loader-shimmer relative h-full rounded-full bg-[linear-gradient(90deg,#35d7ff_0%,#2de1d2_45%,#86f4bf_100%)] shadow-[0_0_14px_rgba(53,215,255,0.38)] transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
