import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONTACT_GRID_LABELS,
  contactForGridIndex,
  moveContactGridIndex,
} from "../src/app/(game)/kick-contact-grid";
import { KickContactDialog } from "../src/app/(game)/KickContactDialog";

const envelope = {
  version: 1 as const,
  input_mapping_version: "kick-v1" as const,
  minimum_power: 0.16,
  maximum_power: 0.94,
  maximum_curve: 0.7,
  maximum_lift: 0.8,
  contact_radius: 0.72,
};

describe("kick contact dialog", () => {
  it("exposes a modal dialog and nine semantic ball contact controls", () => {
    const markup = renderToStaticMarkup(
      <KickContactDialog
        envelope={envelope}
        contact={{ x: 0, y: 0 }}
        submittedPower={0.8}
        submitError={null}
        isSubmitting={false}
        onContactChange={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('role="grid"');
    expect(markup.match(/role="gridcell"/gu)).toHaveLength(9);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Driven");
    expect(markup).toContain("Level");
    expect(markup).toContain("Straight");
    expect(markup).not.toMatch(/Submitted power|Server power range|Contact:/u);
    expect(markup).not.toContain("0.80");
  });

  it("exposes raw values only when development diagnostics are explicitly enabled", () => {
    const markup = renderToStaticMarkup(
      <KickContactDialog
        envelope={envelope}
        contact={{ x: 0.25, y: -0.5 }}
        submittedPower={0.8}
        submitError={null}
        isSubmitting={false}
        onContactChange={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
        showDiagnostics
      />,
    );

    expect(markup).toContain("kick-development-diagnostics");
    expect(markup).toContain("DEV · power 0.8000");
    expect(markup).toContain("contact 0.2500, -0.5000");
  });

  it("moves through the contact grid without leaving its bounds", () => {
    expect(moveContactGridIndex(4, "ArrowUp")).toBe(1);
    expect(moveContactGridIndex(1, "ArrowLeft")).toBe(0);
    expect(moveContactGridIndex(0, "ArrowUp")).toBe(0);
    expect(moveContactGridIndex(8, "ArrowRight")).toBe(8);
    expect(CONTACT_GRID_LABELS[moveContactGridIndex(4, "ArrowDown")]).toBe(
      "Lower center",
    );
  });

  it("keeps diagonal keyboard contacts inside the server radius", () => {
    const contact = contactForGridIndex(0, 0.72);
    expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(0.72);
  });
});
