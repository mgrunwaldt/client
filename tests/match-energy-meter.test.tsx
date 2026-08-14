import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LegendEnergyMeter } from "../src/app/(main)/Match/components/LegendEnergyMeter";
import { HalftimePanel } from "../src/app/(main)/Match/components/MatchLifecyclePanels";

describe("timeline legend energy meter", () => {
  it("represents authoritative energy as a percentage of stamina without numeric labels", () => {
    const markup = renderToStaticMarkup(
      <LegendEnergyMeter current={58.05} capacity={78} />,
    );

    expect(markup).toContain('style="width:74%"');
    expect(markup).not.toContain("58");
    expect(markup).not.toContain("78");
    expect(markup).not.toContain("remaining");
    expect(markup).not.toContain("used");
    expect(markup).not.toContain("effort");
  });

  it("presents halftime as an energy recovery moment without duplicate match data", () => {
    const markup = renderToStaticMarkup(
      <HalftimePanel
        summary={{
          version: 1,
          match_id: "match-1",
          minute: 45,
          score: { my_team: 2, opponent_team: 1 },
          team_statistics: {
            my_team: {
              score: 2,
              attacks: 5,
              goals_in_play: 2,
              yellow_cards: 1,
              red_cards: 0,
            },
            opponent_team: {
              score: 1,
              attacks: 3,
              goals_in_play: 1,
              yellow_cards: 0,
              red_cards: 0,
            },
          },
          legend_contribution: {
            version: 1,
            legend_player_id: "legend-1",
            status: "AVAILABLE",
            availability: "AVAILABLE",
            minutes_played: 45,
            interventions: 2,
            completed_actions: 2,
            successful_actions: 1,
            goals: 0,
            assists: 1,
            yellow_cards: 0,
            red_card: false,
            injured: false,
            substituted: false,
            energy_start: 70,
            energy_current: 32,
            stamina: 78,
          },
          recovery: {
            version: 1,
            config_version: "halftime-recovery/1",
            eligibility: "ELIGIBLE",
            legend_status: "AVAILABLE",
            stamina: 78,
            energy_before: 32,
            energy_recovered: 16,
            energy_after: 48,
            minimum_energy: 4,
            maximum_energy: 18,
          },
          continue_required: true,
          tactics_editable: false,
        }}
        pending={false}
        onContinue={() => undefined}
      />,
    );

    expect(markup).toContain("Half time");
    expect(markup).toContain("halftime-energy-recovery");
    expect(markup).toContain("Second half");
    expect(markup).not.toContain("Authoritative");
    expect(markup).not.toContain("Attacks");
    expect(markup).not.toContain("Cards");
    expect(markup).not.toContain("Legend:");
    expect(markup).not.toContain("Recovery:");
    expect(markup).not.toContain("2 - 1");
  });
});
