import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatchControls } from "../src/app/(main)/Match/components/MatchControls";

describe("match tactics controls", () => {
  it("keeps tactics interactive while the selected choice is syncing", () => {
    const markup = renderToStaticMarkup(
      <MatchControls
        effort="high"
        setEffort={() => undefined}
        playstyle="balanced"
        setPlaystyle={() => undefined}
        syncing
      />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-testid="current-effort"');
    expect(markup).toContain(">High<");
    expect(markup).toContain('data-testid="current-playstyle"');
    expect(markup).toContain(">Balanced<");
    expect(markup).toContain("Tactics syncing");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-testid="tactics-option-drawer"');
    expect(markup).not.toContain("disabled");
    expect(markup).not.toContain("Saving tactics");
  });
});
