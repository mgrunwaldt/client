import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LiveHeader } from "../src/app/(main)/Match/components/LiveHeader";

describe("live match header", () => {
  it("links the scoring team pulse to the corresponding timeline event", () => {
    const markup = renderToStaticMarkup(
      <LiveHeader
        homeTeamName="Dojo United"
        awayTeamName="Cartridge City"
        homeScore={2}
        awayScore={1}
        time={34}
        scoreChange={{ side: "home", eventId: "match_17" }}
      />,
    );

    expect(markup).toContain('data-score-event-id="match_17"');
    expect(markup).toContain("score-event-pulse-team");
    expect(markup).not.toContain("score-event-pulse-opponent");
  });

  it("uses opponent semantics when the away score changes", () => {
    const markup = renderToStaticMarkup(
      <LiveHeader
        homeTeamName="Dojo United"
        awayTeamName="Cartridge City"
        homeScore={0}
        awayScore={1}
        time={20}
        scoreChange={{ side: "away", eventId: "match_8" }}
      />,
    );

    expect(markup).toContain('data-score-event-id="match_8"');
    expect(markup).toContain("score-event-pulse-opponent");
  });
});
