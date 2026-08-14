import { describe, expect, it } from "vitest";

import type { BackendDecisionResult } from "../src/match/api-v1/contract";
import { kickFailurePresentation } from "../src/match/kick-outcome-presentation";

function result(fields: Partial<BackendDecisionResult>): BackendDecisionResult {
  return {
    description: "Resolved.",
    outcome_type: "KICK_OUT",
    success: false,
    ...fields,
  };
}

describe("kick outcome presentation", () => {
  it("identifies an overhit receiver without changing the outcome", () => {
    expect(
      kickFailurePresentation(
        result({
          outcome_type: "OVERHIT_PASS",
          flight_outcome: "OVERHIT_TEAMMATE",
          receiver: { id: "receiver-7" } as BackendDecisionResult["receiver"],
        }),
      ),
    ).toEqual({
      family: "overhit",
      holdMs: 900,
      involvedPlayerId: "receiver-7",
    });
  });

  it("identifies the authoritative interceptor", () => {
    expect(
      kickFailurePresentation(
        result({
          outcome_type: "DEFENDER_INTERCEPT",
          flight_outcome: "DEFENDER_INTERCEPT",
          interceptor: {
            id: "defender-4",
          } as BackendDecisionResult["interceptor"],
        }),
      ),
    ).toEqual({
      family: "interception",
      holdMs: 800,
      involvedPlayerId: "defender-4",
    });
  });

  it("identifies a missed target without inventing an involved player", () => {
    expect(
      kickFailurePresentation(
        result({ outcome_type: "KICK_OUT", flight_outcome: "OUT_OF_PLAY" }),
      ),
    ).toEqual({
      family: "missed-target",
      holdMs: 800,
      involvedPlayerId: null,
    });
  });

  it("does not decorate successful control or unrelated outcomes", () => {
    expect(
      kickFailurePresentation(
        result({
          outcome_type: "KICK_TO_OPEN_PLAY",
          flight_outcome: "TEAMMATE_CONTROL",
          success: true,
        }),
      ),
    ).toBeNull();
    expect(kickFailurePresentation(undefined)).toBeNull();
  });
});
