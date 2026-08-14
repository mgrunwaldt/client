import { StaminaBar } from "../../../../components/ui/stamina-bar";
import type { BackendLegendProfile } from "../../../../lib/backend-match";
type PreMatchLegendProps = {
  legendProfile: BackendLegendProfile;
};

export default function PreMatchLegend({ legendProfile }: PreMatchLegendProps) {
  const energyPercent = Math.round(
    (legendProfile.energy / Math.max(1, legendProfile.stamina)) * 100,
  );

  return (
    <section
      aria-label="Legend readiness"
      className="border-overgoal-positive/70 flex w-full shrink-0 items-center gap-3 rounded-2xl border bg-[#001b19]/90 p-3 text-white shadow-[inset_0_0_24px_rgba(0,255,209,0.05)]"
    >
      <img
        src="/logo.png"
        alt=""
        className="h-11 w-11 shrink-0 rounded-full border border-cyan-300/40 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 text-left">
            <p className="font-orbitron text-[8px] font-bold tracking-[0.24em] text-cyan-200/70 uppercase">
              Legend ready
            </p>
            <p
              data-testid="legend-player-name"
              className="font-orbitron truncate text-xs font-black text-white uppercase"
            >
              Your Legend
            </p>
          </div>
          <div className="font-orbitron flex shrink-0 items-baseline gap-1 text-[9px] font-bold text-white/60 uppercase">
            Stamina
            <output
              data-testid="legend-stamina"
              className="text-overgoal-lime-green text-xs"
            >
              {legendProfile.stamina}
            </output>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-orbitron shrink-0 text-[9px] font-bold tracking-wider text-cyan-100 uppercase">
            Energy
          </span>
          <StaminaBar value={energyPercent} className="h-2.5 min-w-0 flex-1" />
          <output
            data-testid="legend-energy"
            className="font-orbitron text-overgoal-lime-green w-7 shrink-0 text-right text-xs font-black"
          >
            {legendProfile.energy}
          </output>
        </div>
      </div>
    </section>
  );
}
