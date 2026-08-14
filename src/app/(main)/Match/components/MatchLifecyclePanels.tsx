import type { CSSProperties } from "react";

import { Button } from "../../../../components/ui/button";
import type {
  BackendHalftimeSummary,
  BackendLegendAvailabilityState,
} from "../../../../match/api-v1/contract";

export function HalftimePanel({
  summary,
  pending,
  onContinue,
}: {
  summary: BackendHalftimeSummary;
  pending: boolean;
  onContinue: () => void;
}) {
  const recovery = summary.recovery;
  const capacity = Math.max(1, recovery.stamina);
  const beforePercent = Math.max(
    0,
    Math.min(100, (recovery.energy_before / capacity) * 100),
  );
  const afterPercent = Math.max(
    0,
    Math.min(100, (recovery.energy_after / capacity) * 100),
  );
  return (
    <section
      data-testid="halftime-panel"
      aria-labelledby="halftime-title"
      className="relative w-full overflow-hidden rounded-3xl border border-cyan-300/55 bg-[radial-gradient(circle_at_50%_0%,rgba(0,228,232,0.18),transparent_55%),linear-gradient(145deg,rgba(1,22,39,0.98),rgba(2,3,20,0.98))] p-6 shadow-[0_0_40px_rgba(0,228,232,0.2)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-200 to-transparent" />
      <h2
        id="halftime-title"
        className="font-orbitron text-center text-3xl font-black tracking-[0.14em] text-white uppercase drop-shadow-[0_0_14px_rgba(0,228,232,0.45)]"
      >
        Half time
      </h2>

      <div
        className="halftime-energy-stage mt-6 rounded-2xl border border-lime-200/35 bg-black/30 p-4 shadow-[inset_0_0_24px_rgba(34,211,238,0.08)]"
        role="progressbar"
        aria-label="Half-time energy recovery"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={recovery.energy_after}
      >
        <div className="relative h-4 overflow-visible rounded-full border border-cyan-200/35 bg-slate-950/90 shadow-inner">
          <div
            data-testid="halftime-energy-recovery"
            className="halftime-energy-recovery h-full rounded-full bg-linear-to-r from-cyan-400 via-emerald-300 to-lime-300"
            style={
              {
                "--energy-before": `${beforePercent}%`,
                "--energy-after": `${afterPercent}%`,
              } as CSSProperties
            }
          >
            <span aria-hidden="true" className="halftime-energy-spark" />
          </div>
        </div>
      </div>
      <Button
        data-testid="continue-second-half"
        aria-label="Continue second half"
        disabled={pending || !summary.continue_required}
        onClick={onContinue}
        className="font-orbitron mt-5 min-h-14 w-full border border-cyan-200/80 bg-cyan-300/15 tracking-[0.24em] text-cyan-50 uppercase shadow-[0_0_18px_rgba(0,228,232,0.12)] hover:bg-cyan-200/25 disabled:opacity-50"
      >
        {pending ? "Kick-off..." : "Second half"}
      </Button>
    </section>
  );
}

const unavailableCopy = {
  SUBSTITUTED: "substituted",
  INJURED: "injured",
  EXPELLED: "expelled",
} as const;

export function LegendUnavailablePanel({
  availability,
  minute,
}: {
  availability: BackendLegendAvailabilityState;
  minute: number;
}) {
  if (availability.availability !== "UNAVAILABLE") return null;
  return (
    <section
      data-testid="legend-unavailable-simulation"
      aria-live="polite"
      className="w-full rounded-2xl border border-amber-300/45 bg-slate-950/90 p-5 text-center shadow-[0_0_28px_rgba(251,191,36,0.12)]"
    >
      <p className="font-orbitron text-xs font-bold tracking-[0.28em] text-amber-200 uppercase">
        Legend{" "}
        {availability.status === "AVAILABLE"
          ? "unavailable"
          : unavailableCopy[availability.status]}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-100">
        The remainder is being simulated from the authoritative timeline.
      </p>
      <p className="font-orbitron mt-3 text-xs tracking-[0.18em] text-amber-100 uppercase">
        Live minute {minute}&apos; · no replacement controls
      </p>
    </section>
  );
}
