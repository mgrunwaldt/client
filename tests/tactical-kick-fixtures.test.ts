import { describe, expect, it } from "vitest";

import { CANONICAL_KICK_SCENES } from "../src/match/kick-input";
import { tacticalKickFixtures } from "./fixtures/tactical-kick-fixtures";

describe("seeded tactical kick fixture matrix", () => {
  it("covers every canonical scene and representative outcome family", () => {
    expect(
      new Set(tacticalKickFixtures.map((fixture) => fixture.scene)),
    ).toEqual(new Set(CANONICAL_KICK_SCENES));
    expect(
      tacticalKickFixtures.every((fixture) => fixture.seed.length > 0),
    ).toBe(true);
    expect(tacticalKickFixtures.map((fixture) => fixture.outcome)).toEqual(
      expect.arrayContaining([
        "TEAMMATE_CONTROL",
        "INTERCEPTION",
        "GOAL",
        "SAVE",
        "SECOND_BALL",
        "CLEARANCE",
        "REBOUND",
      ]),
    );
  });
});
