import { describe, expect, it } from "vitest";

import { buildBallAimDraft } from "../src/match/kick-gesture";

describe("reverse kick gesture", () => {
  it("turns a backward drag into a forward normalized aim with extended power", () => {
    const draft = buildBallAimDraft(
      { x: 4, y: 10, z: -3 },
      { x: -28, y: 10, z: -3 },
    );
    expect(draft).toMatchObject({
      shotVector: { x: 32, y: 0, z: 0 },
      normalizedDirection: { x: 1, y: 0, z: 0 },
      normalizedPower: 1,
    });
  });

  it("does not prepare a contact modal draft until the pointer has moved", () => {
    expect(
      buildBallAimDraft({ x: 0, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }),
    ).toBeNull();
  });
});
