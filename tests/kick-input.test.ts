import { describe, expect, it } from "vitest";

import {
  ballFaceContactFromPercent,
  ballFacePercentFromContact,
  buildCanonicalKickDecision,
  clampContactToRadius,
  createKickSubmissionGate,
  parseKickControlEnvelope,
} from "../src/match/kick-input";

const envelope = {
  version: 1,
  input_mapping_version: "kick-v1",
  minimum_power: 0.2,
  maximum_power: 0.8,
  maximum_curve: 0.8,
  maximum_lift: 0.8,
  contact_radius: 0.7,
};

describe("canonical kick input", () => {
  it("maps the ball face to canonical Cartesian coordinates", () => {
    expect(ballFaceContactFromPercent({ x: 0, y: 100 })).toEqual({
      x: -1,
      y: -1,
    });
    expect(ballFaceContactFromPercent({ x: 100, y: 0 })).toEqual({
      x: 1,
      y: 1,
    });
    expect(ballFacePercentFromContact({ x: 0.4, y: -0.6 })).toEqual({
      x: 70,
      y: 80,
    });
  });

  it("clamps power and contact to the server envelope without deriving intent", () => {
    expect(
      buildCanonicalKickDecision(envelope, { x: 3, y: -4 }, 1, {
        x: 1,
        y: 1,
      }),
    ).toEqual({
      choice: "KICK",
      kick_input: {
        version: 1,
        aim: { x: 0.6, y: -0.8 },
        power: 0.8,
        contact: {
          x: 0.4949747468305832,
          y: 0.4949747468305832,
        },
      },
    });
  });

  it("uses the envelope's minimum power and rejects zero aim", () => {
    expect(
      buildCanonicalKickDecision(envelope, { x: 0, y: -8 }, 0, {
        x: 0,
        y: 0,
      }).kick_input.power,
    ).toBe(0.2);
    expect(() =>
      buildCanonicalKickDecision(envelope, { x: 0, y: 0 }, 0.5, {
        x: 0,
        y: 0,
      }),
    ).toThrow("non-zero aim");
  });

  it("validates server-authored envelopes and preserves radius boundaries", () => {
    expect(parseKickControlEnvelope(envelope)).toEqual(envelope);
    expect(parseKickControlEnvelope({ ...envelope, contact_radius: 1.1 })).toBe(
      null,
    );
    expect(clampContactToRadius({ x: -0.2, y: 0.3 }, 0.7)).toEqual({
      x: -0.2,
      y: 0.3,
    });
  });

  it("accepts exactly one submission per action and allows transport retry", () => {
    const gate = createKickSubmissionGate();
    expect(gate.begin("kick-1")).toBe(true);
    expect(gate.begin("kick-1")).toBe(false);
    expect(gate.begin("kick-2")).toBe(true);
    gate.reset("kick-2");
    expect(gate.begin("kick-2")).toBe(true);
  });
});
