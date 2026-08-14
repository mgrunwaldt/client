import { describe, expect, it } from "vitest";

import type { BackendDecisionResult } from "../src/match/api-v1/contract";
import { automaticFinishPresentation } from "../src/match/automatic-finish-presentation";

function result(outcomeType: string): BackendDecisionResult {
  return {
    description: "Automatic finish.",
    outcome_type: outcomeType,
    success: outcomeType === "AUTOMATIC_TEAMMATE_GOAL",
    automatic_follow_up: {
      type: "TEAMMATE_SHOT",
      actor_player_id: "receiver",
      opportunity: {
        eligible: true,
        score: 80,
        distance_to_goal_m: 10,
        nearest_defender_m: 3,
        lane_blocked: false,
        scene_pressure: 40,
        receive_speed_mps: 8,
      },
      flight_path: [
        { x: 50, y: 10, z: 0.11, t: 0 },
        { x: 50, y: 0, z: 0.11, t: 0.5 },
      ],
      flight_outcome: "GOAL",
      final_point: { x: 50, y: 0, z: 0.11, t: 0.5 },
      contact: {
        type: "GOALKEEPER",
        player_id: "keeper",
        at: { x: 50, y: 1, z: 0.8, t: 0.45 },
      },
      frame_contacts: [],
    },
  };
}

describe("automatic finish presentation", () => {
  it.each([
    ["AUTOMATIC_TEAMMATE_GOAL", "goal", 2_200],
    ["AUTOMATIC_TEAMMATE_SAVED", "saved", 2_200],
    ["AUTOMATIC_TEAMMATE_BLOCKED", "blocked", 2_200],
    ["AUTOMATIC_TEAMMATE_MISSED", "missed", 2_200],
  ] as const)("maps %s to %s", (outcomeType, outcome, responseHoldMs) => {
    expect(automaticFinishPresentation(result(outcomeType))).toEqual({
      actorPlayerId: "receiver",
      contactPlayerId: "keeper",
      outcome,
      responseHoldMs,
    });
  });

  it("does not decorate a normal kick", () => {
    expect(
      automaticFinishPresentation({
        description: "Pass complete.",
        outcome_type: "CONTROLLED_PASS",
        success: true,
      }),
    ).toBeNull();
  });
});
