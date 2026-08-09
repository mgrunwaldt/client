import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PreMatchLegend from "../src/app/(main)/Pre-Match/components/pre-match-legend";
import PreMatchTeam from "../src/app/(main)/Pre-Match/components/pre-match-team";

describe("pre-match authoritative Legend presentation", () => {
  it("renders backend Legend identity and every authoritative profile value", () => {
    const markup = renderToStaticMarkup(
      createElement(PreMatchLegend, {
        legendPlayerId: "legend-api-9",
        legendProfile: {
          stamina: 63,
          energy: 41,
          shoot: 92,
          dribble: 88,
          speed: 81,
          passing: 79,
          heading: 75,
          defense: 54,
          intelligence: 90,
        },
      }),
    );

    expect(markup).toContain("legend-api-9");
    expect(markup).toMatch(/data-testid="legend-stamina"[^>]*>63</u);
    expect(markup).toMatch(/data-testid="legend-energy"[^>]*>41</u);
    for (const value of [92, 88, 81, 79, 75, 54, 90]) {
      expect(markup).toContain(`>${value}<`);
    }
    expect(markup).not.toContain(">10<");
  });

  it("keeps an unknown backend team identity while using only generic V1 artwork", () => {
    const markup = renderToStaticMarkup(
      createElement(PreMatchTeam, {
        teamName: "API Eclipse XI",
        side: "left",
        isMyTeam: true,
      }),
    );

    expect(markup).toContain("API Eclipse XI");
    expect(markup).toContain('src="/logo.png"');
    expect(markup).not.toContain("Dojo United");
  });
});
