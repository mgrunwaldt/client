import { Button } from "../../../../components/ui/button";
import type {
  BackendHalftimeSummary,
  BackendLegendAvailabilityState,
} from "../../../../match/api-v1/contract";

function contributionSummary(summary: BackendHalftimeSummary) {
  const contribution = summary.legend_contribution;
  return [
    `${contribution.minutes_played}' played`,
    `${contribution.successful_actions}/${contribution.interventions} actions`,
    `${contribution.goals} goals`,
    `${contribution.assists} assists`,
  ];
}

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
  return (
    <section
      data-testid="halftime-panel"
      aria-labelledby="halftime-title"
      className="w-full rounded-2xl border border-cyan-300/45 bg-slate-950/90 p-5 shadow-[0_0_32px_rgba(34,211,238,0.16)]"
    >
      <p className="font-orbitron text-xs font-bold uppercase tracking-[0.32em] text-cyan-300">
        Authoritative interval
      </p>
      <h2
        id="halftime-title"
        className="font-orbitron mt-2 text-2xl font-black uppercase text-white"
      >
        Halftime 45&apos;
      </h2>
      <p className="font-orbitron mt-2 text-lg text-cyan-100">
        {summary.score.my_team} - {summary.score.opponent_team}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-200">
        <p>
          Attacks: {summary.team_statistics.my_team.attacks} -{" "}
          {summary.team_statistics.opponent_team.attacks}
        </p>
        <p>
          Cards:{" "}
          {summary.team_statistics.my_team.yellow_cards +
            summary.team_statistics.my_team.red_cards}{" "}
          -{" "}
          {summary.team_statistics.opponent_team.yellow_cards +
            summary.team_statistics.opponent_team.red_cards}
        </p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-200">
        Legend: {contributionSummary(summary).join(" · ")}
      </p>
      <p className="mt-2 text-sm text-lime-200">
        Recovery: {recovery.energy_before} to {recovery.energy_after} (+
        {recovery.energy_recovered})
      </p>
      <Button
        data-testid="continue-second-half"
        aria-label="Continue second half"
        disabled={pending || !summary.continue_required}
        onClick={onContinue}
        className="font-orbitron mt-5 min-h-12 w-full border border-cyan-200 bg-cyan-300/15 uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-200/25 disabled:opacity-50"
      >
        {pending ? "Resuming..." : "Continue"}
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
      <p className="font-orbitron text-xs font-bold uppercase tracking-[0.28em] text-amber-200">
        Legend{" "}
        {availability.status === "AVAILABLE"
          ? "unavailable"
          : unavailableCopy[availability.status]}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-100">
        The remainder is being simulated from the authoritative timeline.
      </p>
      <p className="font-orbitron mt-3 text-xs uppercase tracking-[0.18em] text-amber-100">
        Live minute {minute}&apos; · no replacement controls
      </p>
    </section>
  );
}
