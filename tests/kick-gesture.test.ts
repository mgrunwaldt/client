import { describe, expect, it } from "vitest";

import {
  FIELD_WORLD_SCALE,
  worldVectorToFieldAim,
} from "../src/match/field-transform";
import { buildBallAimDraft } from "../src/match/kick-gesture";

describe("reverse kick gesture", () => {
  it("turns a backward drag into a forward normalized aim with extended power", () => {
    const draft = buildBallAimDraft(
      { x: 4, y: 10, z: -3 },
      { x: 2, y: 10, z: -3 },
      80,
    );
    expect(draft).toMatchObject({
      shotVector: { x: 2, y: 0, z: 0 },
      normalizedDirection: { x: 1, y: 0, z: 0 },
      normalizedPower: 1,
    });
  });

  it("saturates power for pulls beyond the short full-power distance", () => {
    const draft = buildBallAimDraft(
      { x: 1, y: 10, z: -3 },
      { x: 0, y: 10, z: -3 },
      120,
    );

    expect(draft?.normalizedPower).toBe(1);
  });

  it("keeps partial pull power proportional to the full-power distance", () => {
    const draft = buildBallAimDraft(
      { x: 4, y: 10, z: -3 },
      { x: 3, y: 10, z: -3 },
      40,
    );

    expect(draft?.normalizedPower).toBe(0.5);
  });

  it("does not prepare a contact modal draft until the pointer has moved", () => {
    expect(
      buildBallAimDraft({ x: 0, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }),
    ).toBeNull();
  });

  it("keeps a diagonal reverse-drag aligned through the backend field mapping", () => {
    const draft = buildBallAimDraft(
      { x: 0, y: 0.11, z: 0 },
      { x: -1, y: 0.11, z: 1 },
      80,
    );
    const aim = worldVectorToFieldAim(draft!.shotVector);
    const simulatedWorldVector = {
      x: aim!.x * FIELD_WORLD_SCALE.x,
      z: aim!.y * FIELD_WORLD_SCALE.z,
    };

    expect(
      simulatedWorldVector.x /
        Math.hypot(simulatedWorldVector.x, simulatedWorldVector.z),
    ).toBeCloseTo(draft!.normalizedDirection.x);
    expect(
      simulatedWorldVector.z /
        Math.hypot(simulatedWorldVector.x, simulatedWorldVector.z),
    ).toBeCloseTo(draft!.normalizedDirection.z);
  });
});
