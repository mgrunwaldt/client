import { describe, expect, it, vi } from "vitest";

import {
  canSwitchDribbleLane,
  createDribbleDecision,
  createDribbleSubmissionGate,
  type DribblePattern,
  elapsedDribbleSeconds,
  parseDribblePattern,
  pressureWindowForDribbleAttempt,
  validateDribbleLaneTrace,
} from "../src/match/dribble-input";
import { readFixture } from "./match-api-v1-fixtures";

async function patternFromFixture(): Promise<DribblePattern> {
  const scene = await readFixture<{
    field_state: { dribble_pattern: unknown };
  }>("scenes/dribble.json");
  const parsed = parseDribblePattern(scene.field_state.dribble_pattern);
  if (!parsed.pattern) throw new Error(parsed.error);
  return parsed.pattern;
}

describe("authoritative dribble input", () => {
  it("strictly accepts the pinned v1 pattern and rejects unknown or future controls", async () => {
    const pattern = await patternFromFixture();
    expect(pattern).toMatchObject({
      version: 1,
      input_mapping_version: "dribble-lanes-v1",
      duration_seconds: 8,
      lanes: ["LEFT", "CENTER", "RIGHT"],
    });

    expect(parseDribblePattern({ ...pattern, version: 2 }).pattern).toBeNull();
    expect(
      parseDribblePattern({ ...pattern, selection_quality: 0.9 }).pattern,
    ).toBeNull();
    expect(
      parseDribblePattern({
        ...pattern,
        pressure_windows: pattern.pressure_windows.slice(1),
      }).pattern,
    ).toBeNull();
  });

  it("only emits canonical adjacent lane traces and exact run payloads", async () => {
    const pattern = await patternFromFixture();
    const trace = [
      { at_second: 0, lane: "RIGHT" as const },
      { at_second: 1, lane: "CENTER" as const },
    ];

    expect(validateDribbleLaneTrace(pattern, trace)).toBe(true);
    expect(canSwitchDribbleLane(pattern, trace, "LEFT", 1.58)).toBe(true);
    expect(canSwitchDribbleLane(pattern, trace, "RIGHT", 1.1)).toBe(false);
    expect(
      validateDribbleLaneTrace(pattern, [{ at_second: 0, lane: "LEFT" }]),
    ).toBe(false);
    expect(createDribbleDecision(pattern, trace, "DRIBBLE_RUN")).toEqual({
      choice: "DRIBBLE_RUN",
      lane_trace: trace,
    });
  });

  it("gates simulation to the authoritative pressure window and sends no client outcome", async () => {
    const pattern = await patternFromFixture();
    const trace = [{ at_second: 0, lane: "RIGHT" as const }];

    expect(pressureWindowForDribbleAttempt(pattern, trace, 0)).toBeNull();
    expect(pressureWindowForDribbleAttempt(pattern, trace, 2.97)?.id).toBe(
      "pressure-2",
    );
    expect(
      createDribbleDecision(pattern, trace, "SIMULATE_FOUL", 0),
    ).toBeNull();
    expect(
      createDribbleDecision(pattern, trace, "SIMULATE_FOUL", 2.97),
    ).toEqual({
      choice: "SIMULATE_FOUL",
      lane_trace: trace,
      simulate_at_second: 2.97,
    });
  });

  it("has a deterministic eight-second clock and exactly-once submission gate", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const startedAt = Date.now();
      vi.advanceTimersByTime(8_300);
      expect(elapsedDribbleSeconds(startedAt, Date.now(), 8)).toBe(8);
      expect(elapsedDribbleSeconds(startedAt, startedAt - 100, 8)).toBe(0);

      const gate = createDribbleSubmissionGate();
      expect(gate.begin("dribble-1")).toBe(true);
      expect(gate.begin("dribble-1")).toBe(false);
      gate.reset("dribble-1");
      expect(gate.begin("dribble-1")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
