import { describe, expect, it } from "vitest";

import type { BackendDecisionResult } from "../src/match/api-v1/contract";
import {
  authoritativeTrajectoryPlayback,
  AUTOMATIC_SHOT_CONTROL_HOLD_SECONDS,
} from "../src/match/trajectory-playback";

const passResult: BackendDecisionResult = {
  description: "Successful pass.",
  success: true,
  outcome_type: "AUTOMATIC_TEAMMATE_GOAL",
  flight_outcome: "TEAMMATE_CONTROL",
  flight_path: [
    { x: 50, y: 40, z: 0.11, t: 0 },
    { x: 52, y: 20, z: 0.11, t: 0.8 },
  ],
  final_point: { x: 52, y: 20, z: 0.11, t: 0.8 },
};

describe("authoritativeTrajectoryPlayback", () => {
  it("returns no playback for a non-flight result", () => {
    expect(
      authoritativeTrajectoryPlayback({
        description: "Dribble complete.",
        success: true,
        outcome_type: "DRIBBLE_SURVIVAL",
      }),
    ).toBeNull();
  });

  it("uses the canonical trajectory and final point unchanged", () => {
    expect(authoritativeTrajectoryPlayback(passResult)).toEqual({
      path: passResult.flight_path,
      finalPoint: passResult.final_point,
    });
  });

  it("plays the incoming pass, control hold, and automatic shot in order", () => {
    const result: BackendDecisionResult = {
      ...passResult,
      automatic_follow_up: {
        type: "TEAMMATE_SHOT",
        actor_player_id: "team_1_ST_10",
        opportunity: {
          eligible: true,
          score: 84,
          distance_to_goal_m: 11,
          nearest_defender_m: 3,
          lane_blocked: false,
          scene_pressure: 62,
          receive_speed_mps: 8,
        },
        flight_path: [
          { x: 52, y: 20, z: 0.11, t: 0 },
          { x: 50, y: -0.2, z: 0.11, t: 0.7 },
        ],
        flight_outcome: "GOAL",
        final_point: { x: 50, y: -0.2, z: 0.11, t: 0.7 },
        contact: null,
        frame_contacts: [],
      },
    };

    const playback = authoritativeTrajectoryPlayback(result);
    const automaticStart =
      passResult.final_point!.t + AUTOMATIC_SHOT_CONTROL_HOLD_SECONDS;

    expect(playback?.path).toEqual([
      ...passResult.flight_path!,
      { x: 52, y: 20, z: 0.11, t: automaticStart },
      { x: 50, y: -0.2, z: 0.11, t: automaticStart + 0.7 },
    ]);
    expect(playback?.finalPoint).toEqual({
      x: 50,
      y: -0.2,
      z: 0.11,
      t: automaticStart + 0.7,
    });
  });
});
