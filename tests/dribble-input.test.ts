import { describe, expect, it, vi } from "vitest";

import {
  canSwitchDribbleLane,
  createDribbleDecision,
  createDribbleSubmissionGate,
  type DribblePattern,
  dribblePresentationAtSecond,
  elapsedDribbleSeconds,
  firstDribbleCollisionAtSecond,
  parseDribblePattern,
  pressureWindowForDribbleAttempt,
  selectDribbleDefenderTemplate,
  validateDribbleLaneTrace,
} from "../src/match/dribble-input";
import { readFixture } from "./match-api-v1-fixtures";

async function patternFromFixture(): Promise<DribblePattern> {
  const scene = await readFixture<{
    field_state: { dribble_pattern: unknown };
  }>("scenes/dribble.json");
  const parsed = parseDribblePattern(scene.field_state.dribble_pattern);
  if (!parsed.pattern) throw new Error(parsed.error);
  const waveSeconds = [1.4, 3.4, 5.4, 7.4];
  return {
    ...parsed.pattern,
    starting_lane: "CENTER",
    defender_waves: parsed.pattern.defender_waves.map((wave, index) => ({
      ...wave,
      at_second: waveSeconds[index],
    })),
    pressure_windows: parsed.pattern.pressure_windows.map((window, index) => ({
      ...window,
      start_second: waveSeconds[index] - 0.41,
      end_second: waveSeconds[index] + 0.41,
    })),
  };
}

describe("authoritative dribble input", () => {
  it("strictly accepts the pinned v1 pattern and rejects unknown or future controls", async () => {
    const pattern = await patternFromFixture();
    expect(pattern).toMatchObject({
      version: 1,
      input_mapping_version: "dribble-lanes-v1",
      duration_seconds: 8,
      lanes: ["LEFT", "CENTER", "RIGHT"],
      starting_lane: "CENTER",
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
      { at_second: 0, lane: "CENTER" as const },
      { at_second: 0.1, lane: "LEFT" as const },
    ];

    expect(validateDribbleLaneTrace(pattern, trace)).toBe(true);
    expect(canSwitchDribbleLane(pattern, trace, "CENTER", 0.68)).toBe(true);
    expect(canSwitchDribbleLane(pattern, trace, "CENTER", 0.2)).toBe(false);
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
    const trace = [{ at_second: 0, lane: "CENTER" as const }];

    expect(pressureWindowForDribbleAttempt(pattern, trace, 0)).toBeNull();
    expect(pressureWindowForDribbleAttempt(pattern, trace, 5.4)?.id).toBe(
      "pressure-3",
    );
    expect(
      createDribbleDecision(pattern, trace, "SIMULATE_FOUL", 0),
    ).toBeNull();
    expect(createDribbleDecision(pattern, trace, "SIMULATE_FOUL", 5.4)).toEqual(
      {
        choice: "SIMULATE_FOUL",
        lane_trace: trace,
        simulate_at_second: 5.4,
      },
    );
  });

  it("maps the authoritative pattern onto one three-lane presentation", async () => {
    const pattern = await patternFromFixture();
    const trace = [
      { at_second: 0, lane: "CENTER" as const },
      { at_second: 0.1, lane: "RIGHT" as const },
    ];

    const start = dribblePresentationAtSecond(pattern, trace, 0);
    expect(start.player).toEqual({ x: 50, y: 38 });
    expect(start.ball).toEqual({ x: 50, y: 36.2 });

    const duringSwitch = dribblePresentationAtSecond(pattern, trace, 0.39);
    expect(duringSwitch.player.x).toBeCloseTo(66.6667, 4);
    const firstCollision = dribblePresentationAtSecond(pattern, trace, 1.4);
    expect(firstCollision.defenders[0]).toMatchObject({
      active: true,
      x: 100 / 6,
      y: 38,
    });
  });

  it("detects the same visible collision the server resolves and clears an avoided wave", async () => {
    const pattern = await patternFromFixture();
    const centerWave = {
      ...pattern.defender_waves[0],
      at_second: 1.4,
      lane: "CENTER" as const,
    };
    const collisionPattern = {
      ...pattern,
      defender_waves: [centerWave, ...pattern.defender_waves.slice(1)],
    };
    const centerTrace = [{ at_second: 0, lane: "CENTER" as const }];
    const avoidedTrace = [
      ...centerTrace,
      { at_second: 0.1, lane: "LEFT" as const },
    ];

    expect(
      firstDribbleCollisionAtSecond(collisionPattern, centerTrace, 1.39),
    ).toBeNull();
    expect(
      firstDribbleCollisionAtSecond(collisionPattern, centerTrace, 1.4)?.id,
    ).toBe(centerWave.id);
    expect(
      firstDribbleCollisionAtSecond(collisionPattern, avoidedTrace, 1.4),
    ).toBeNull();
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

  it("keeps defender waves visible when only a goalkeeper model is available", () => {
    const goalkeeper = { id: "keeper", role: "GK" };
    expect(selectDribbleDefenderTemplate([goalkeeper], 3)).toBe(goalkeeper);
    expect(selectDribbleDefenderTemplate([], 0)).toBeNull();
  });
});
