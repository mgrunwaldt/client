interface LegendEnergyMeterProps {
  current: number;
  capacity: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function LegendEnergyMeter({
  current,
  capacity,
}: LegendEnergyMeterProps) {
  const safeCapacity = Math.max(1, capacity);
  const safeCurrent = clamp(current, 0, safeCapacity);
  const remainingPercent = Math.round((safeCurrent / safeCapacity) * 100);

  return (
    <section
      aria-label="Legend energy"
      data-testid="legend-energy-meter"
      className="mx-auto mb-2 grid min-h-11 w-full max-w-2xl grid-cols-[4.5rem_1fr] items-center gap-2 rounded-xl border border-cyan-400/35 bg-[#020b1c]/90 px-3 py-2 shadow-[0_0_18px_rgba(34,211,238,0.1)]"
    >
      <p className="font-orbitron text-[10px] font-bold tracking-[0.18em] text-cyan-300 uppercase">
        Energy
      </p>

      <div className="h-2.5 overflow-hidden rounded-full border border-cyan-300/25 bg-slate-950">
        <div
          data-testid="legend-energy-fill"
          className="h-full rounded-full bg-linear-to-r from-cyan-400 via-emerald-300 to-lime-300 shadow-[0_0_12px_rgba(163,230,53,0.65)] transition-[width] duration-700 ease-out"
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
    </section>
  );
}
