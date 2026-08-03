import { StaminaBar } from "../../../../components/ui/stamina-bar";
import type { BackendLegendProfile } from "../../../../lib/backend-match";
import CyberContainer from "../../Home/components/cyber-container";
import SemiSquareContainer from "../../Home/components/semi-square/semi-square-container";

type PreMatchLegendProps = {
  legendPlayerId: string;
  legendProfile: BackendLegendProfile;
};

const profileStats = [
  ["SHOOT", "shoot"],
  ["DRIBBLE", "dribble"],
  ["SPEED", "speed"],
  ["PASS", "passing"],
  ["HEADING", "heading"],
  ["DEFENSE", "defense"],
  ["IQ", "intelligence"],
] as const;

export default function PreMatchLegend({
  legendPlayerId,
  legendProfile,
}: PreMatchLegendProps) {
  return (
    <section
      aria-label="Authoritative Legend profile"
      className="border-overgoal-positive border-1 flex w-full flex-col gap-2 bg-[#002601] p-2 text-center text-white"
    >
      <div className="flex w-full flex-row items-center justify-between gap-3">
        <img
          src="/logo.png"
          alt=""
          className="h-14 w-14 shrink-0 object-cover"
        />
        <div className="min-w-0 shrink text-left">
          <p className="font-orbitron text-overgoal-lime-green text-[10px] font-bold uppercase tracking-[0.22em]">
            Legend profile
          </p>
          <p
            data-testid="legend-player-id"
            className="font-orbitron truncate text-xs font-bold uppercase text-white"
          >
            {legendPlayerId}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="font-orbitron text-[9px] font-bold uppercase text-white/80">
              Stamina
            </span>
            <output
              data-testid="legend-stamina"
              className="font-orbitron text-overgoal-lime-green text-xs font-bold"
            >
              {legendProfile.stamina}
            </output>
          </div>
          <CyberContainer className="!h-5 !w-full">
            <StaminaBar
              value={legendProfile.stamina}
              className="h-full w-full"
            />
          </CyberContainer>
        </div>
        <SemiSquareContainer
          bgColor="#002601"
          noShadow={true}
          borderColor="var(--color-overgoal-positive)"
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center"
        >
          <span className="font-orbitron text-[8px] font-bold uppercase text-white/70">
            Energy
          </span>
          <output
            data-testid="legend-energy"
            className="font-orbitron text-overgoal-lime-green text-sm font-bold"
          >
            {legendProfile.energy}
          </output>
        </SemiSquareContainer>
      </div>
      <dl className="grid grid-cols-4 gap-1" aria-label="Legend attributes">
        {profileStats.map(([label, stat]) => (
          <div
            key={stat}
            className="border-overgoal-positive/40 border bg-black/15 px-1 py-1"
          >
            <dt className="font-orbitron text-[8px] font-bold uppercase text-white/65">
              {label}
            </dt>
            <dd className="font-orbitron text-[11px] font-bold text-white">
              {legendProfile[stat]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
