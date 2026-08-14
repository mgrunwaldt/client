import { describe, expect, it } from "vitest";

import type { BackendDecisionResult } from "../src/match/api-v1/contract";
import {
  authoritativeTrajectoryPlayback,
  MIN_READABLE_FLIGHT_MS,
  sampleAuthoritativeFlightPath,
  trajectoryPlaybackDurationMs,
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
  it.each([
    {
      name: "short straight",
      path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 50, y: 38, z: 0.11, t: 0.1 },
      ],
      midpoint: { x: 50, y: 39, z: 0.11 },
      durationMs: MIN_READABLE_FLIGHT_MS,
    },
    {
      name: "curved",
      path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 56, y: 30, z: 0.8, t: 0.5 },
        { x: 54, y: 20, z: 0.11, t: 1 },
      ],
      midpoint: { x: 56, y: 30, z: 0.8 },
      durationMs: 1000,
    },
    {
      name: "lofted",
      path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 50, y: 25, z: 4.2, t: 0.6 },
        { x: 50, y: 10, z: 0.11, t: 1.2 },
      ],
      midpoint: { x: 50, y: 25, z: 4.2 },
      durationMs: 1200,
    },
    {
      name: "maximum power",
      path: [
        { x: 12, y: 84, z: 0.11, t: 0 },
        { x: 50, y: 42, z: 2.4, t: 0.75 },
        { x: 88, y: 0, z: 0.11, t: 1.5 },
      ],
      midpoint: { x: 50, y: 42, z: 2.4 },
      durationMs: 1500,
    },
  ])(
    "preserves the authoritative $name path while keeping it readable",
    ({ path, midpoint, durationMs }) => {
      expect(trajectoryPlaybackDurationMs(path)).toBe(durationMs);
      expect(
        sampleAuthoritativeFlightPath(path, durationMs / 2, durationMs),
      ).toEqual(midpoint);
      expect(
        sampleAuthoritativeFlightPath(path, durationMs, durationMs),
      ).toEqual({
        x: path[path.length - 1].x,
        y: path[path.length - 1].y,
        z: path[path.length - 1].z,
      });
    },
  );

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
      automaticStages: null,
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
          { x: 51.8, y: 19.4, z: 0.11, t: 0.35 },
          { x: 50, y: -0.2, z: 0.11, t: 0.7 },
        ],
        flight_outcome: "GOAL",
        final_point: { x: 50, y: -0.2, z: 0.11, t: 0.7 },
        contact: null,
        frame_contacts: [],
      },
    };

    const playback = authoritativeTrajectoryPlayback(result);
    const automaticStart = passResult.final_point!.t + 0.65;

    expect(playback?.path).toEqual([
      ...passResult.flight_path!,
      { x: 52, y: 20, z: 0.11, t: automaticStart },
      { x: 51.8, y: 19.4, z: 0.11, t: automaticStart + 0.35 },
      { x: 50, y: -0.2, z: 0.11, t: automaticStart + 0.7 },
    ]);
    expect(playback?.finalPoint).toEqual({
      x: 50,
      y: -0.2,
      z: 0.11,
      t: automaticStart + 0.7,
    });
    expect(playback?.automaticStages).toEqual({
      incomingEndMs: passResult.final_point!.t * 1000,
      shotStartMs: automaticStart * 1000,
      shotEndMs: (automaticStart + 0.7) * 1000,
    });
  });
});
