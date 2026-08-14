import { describe, expect, it } from "vitest";

import { kickContactFeedback } from "../src/match/kick-contact-feedback";

describe("player-facing kick contact feedback", () => {
  it.each([
    ["center", { x: 0, y: 0 }, "Level", "Straight"],
    ["upper left", { x: -0.6, y: 0.6 }, "Skimming", "Curl right"],
    ["upper right", { x: 0.6, y: 0.6 }, "Skimming", "Curl left"],
    ["lower left", { x: -0.6, y: -0.6 }, "Lofted", "Curl right"],
    ["lower right", { x: 0.6, y: -0.6 }, "Lofted", "Curl left"],
  ] as const)(
    "describes %s contact without exposing coordinates",
    (_name, contact, flight, curve) => {
      expect(kickContactFeedback(0.72, contact)).toMatchObject({
        flight,
        curve,
      });
    },
  );

  it("expresses minimum and maximum power as discrete game feedback", () => {
    expect(kickContactFeedback(0.16, { x: 0, y: 0 }).power).toEqual({
      label: "Soft touch",
      level: 1,
    });
    expect(kickContactFeedback(0.94, { x: 0, y: 0 }).power).toEqual({
      label: "Full power",
      level: 5,
    });
  });
});
