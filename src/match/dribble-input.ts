import { z } from "zod";

export const DRIBBLE_LANES = ["LEFT", "CENTER", "RIGHT"] as const;

export type DribbleLane = (typeof DRIBBLE_LANES)[number];

const laneSchema = z.enum(DRIBBLE_LANES);
const finiteSecond = z.number().finite().min(0).max(8);

const waveSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    at_second: finiteSecond,
    lane: laneSchema,
    speed: z.number().finite().min(0).max(100),
    foul_chance: z.number().finite().min(0).max(100),
    booking_chance: z.number().finite().min(0).max(100),
  })
  .strict();

const pressureWindowSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    wave_index: z.number().int().min(0).max(7),
    lane: laneSchema,
    start_second: finiteSecond,
    end_second: finiteSecond,
  })
  .strict();

const parametersSchema = z
  .object({
    speed: z.number().finite().min(0).max(100),
    dribble: z.number().finite().min(0).max(100),
    stamina: z.number().finite().min(0).max(100),
    energy: z.number().finite().min(0).max(100),
    energy_ratio: z.number().finite().min(0).max(100),
    pressure: z.number().finite().min(0).max(100),
    switching_score: z.number().finite().min(0).max(100),
    defender_count: z.number().int().min(4).max(8),
    lane_forgiveness: z.number().finite().min(0).max(1),
    pressure_lane_radius: z.number().finite().min(0).max(1),
    pressure_window_seconds: z.number().finite().min(0).max(8),
    close_down_resistance: z.number().finite().min(0).max(100),
    resulting_attack_gain_m: z.number().finite().min(0).max(105),
    simulation_chance_percent: z.number().int().min(35).max(65),
    simulation_attempts_before_scene: z.number().int().min(0).max(99),
  })
  .strict();

export const DribblePatternSchema = z
  .object({
    version: z.literal(1),
    input_mapping_version: z.literal("dribble-lanes-v1"),
    duration_seconds: z.literal(8),
    starting_lane: laneSchema,
    lane_switch_seconds: z.number().finite().min(0.4).max(1.15),
    lanes: z.tuple([
      z.literal("LEFT"),
      z.literal("CENTER"),
      z.literal("RIGHT"),
    ]),
    parameters: parametersSchema,
    defender_waves: z.array(waveSchema).min(4).max(8),
    pressure_windows: z.array(pressureWindowSchema).min(4).max(8),
  })
  .strict()
  .superRefine((pattern, context) => {
    if (pattern.parameters.defender_count !== pattern.defender_waves.length) {
      context.addIssue({
        code: "custom",
        path: ["parameters", "defender_count"],
        message: "defender_count must match defender_waves.",
      });
    }
    if (pattern.pressure_windows.length !== pattern.defender_waves.length) {
      context.addIssue({
        code: "custom",
        path: ["pressure_windows"],
        message: "Each defender wave needs one authoritative pressure window.",
      });
    }

    const ids = new Set<string>();
    pattern.defender_waves.forEach((wave, index) => {
      if (ids.has(wave.id)) {
        context.addIssue({
          code: "custom",
          path: ["defender_waves", index, "id"],
          message: "Defender wave ids must be unique.",
        });
      }
      ids.add(wave.id);
      if (
        index > 0 &&
        wave.at_second <= pattern.defender_waves[index - 1].at_second
      ) {
        context.addIssue({
          code: "custom",
          path: ["defender_waves", index, "at_second"],
          message: "Defender waves must be strictly chronological.",
        });
      }
    });

    pattern.pressure_windows.forEach((window, index) => {
      const wave = pattern.defender_waves[window.wave_index];
      if (
        !wave ||
        wave.lane !== window.lane ||
        window.end_second < window.start_second
      ) {
        context.addIssue({
          code: "custom",
          path: ["pressure_windows", index],
          message:
            "Pressure windows must map to their authoritative defender wave.",
        });
      }
    });
  });

export type DribblePattern = z.infer<typeof DribblePatternSchema>;

export type DribbleLaneTracePoint = {
  at_second: number;
  lane: DribbleLane;
};

export type DribbleDecision =
  | { choice: "DRIBBLE_RUN"; lane_trace: DribbleLaneTracePoint[] }
  | {
      choice: "SIMULATE_FOUL";
      lane_trace: DribbleLaneTracePoint[];
      simulate_at_second: number;
    };

export function parseDribblePattern(value: unknown) {
  const result = DribblePatternSchema.safeParse(value);
  return result.success
    ? { pattern: result.data, error: null }
    : {
        pattern: null,
        error:
          "The match service returned unsupported dribble controls. Refresh before trying again.",
      };
}

export function laneIndex(lane: DribbleLane) {
  return DRIBBLE_LANES.indexOf(lane);
}

export function roundDribbleSecond(value: number) {
  return Math.round(Math.max(0, Math.min(8, value)) * 100) / 100;
}

export function elapsedDribbleSeconds(
  startedAt: number,
  now: number,
  durationSeconds: number,
) {
  return Math.max(0, Math.min(durationSeconds, (now - startedAt) / 1000));
}

export function validateDribbleLaneTrace(
  pattern: DribblePattern,
  trace: DribbleLaneTracePoint[],
) {
  if (trace.length < 1 || trace.length > 64) return false;
  if (trace[0]?.at_second !== 0 || trace[0]?.lane !== pattern.starting_lane) {
    return false;
  }

  return trace.every((point, index) => {
    if (
      !Number.isFinite(point.at_second) ||
      point.at_second < 0 ||
      point.at_second > 8
    ) {
      return false;
    }
    if (!DRIBBLE_LANES.includes(point.lane)) return false;
    if (index === 0) return true;
    const previous = trace[index - 1];
    return (
      point.at_second > previous.at_second &&
      Math.abs(laneIndex(point.lane) - laneIndex(previous.lane)) === 1 &&
      point.at_second - previous.at_second >= pattern.lane_switch_seconds &&
      point.at_second + pattern.lane_switch_seconds <= pattern.duration_seconds
    );
  });
}

export function canSwitchDribbleLane(
  pattern: DribblePattern,
  trace: DribbleLaneTracePoint[],
  nextLane: DribbleLane,
  atSecond: number,
) {
  const current = trace[trace.length - 1];
  if (!current || !DRIBBLE_LANES.includes(nextLane)) return false;
  const roundedSecond = roundDribbleSecond(atSecond);
  return (
    Math.abs(laneIndex(nextLane) - laneIndex(current.lane)) === 1 &&
    roundedSecond - current.at_second >= pattern.lane_switch_seconds &&
    roundedSecond + pattern.lane_switch_seconds <= pattern.duration_seconds
  );
}

export function playerLaneAtSecond(
  pattern: DribblePattern,
  trace: DribbleLaneTracePoint[],
  atSecond: number,
) {
  let position = laneIndex(trace[0]?.lane ?? pattern.starting_lane);
  for (let index = 1; index < trace.length; index += 1) {
    const input = trace[index];
    if (atSecond <= input.at_second) return position;
    const target = laneIndex(input.lane);
    const movementEnd = input.at_second + pattern.lane_switch_seconds;
    if (atSecond < movementEnd) {
      return (
        position +
        ((target - position) * (atSecond - input.at_second)) /
          pattern.lane_switch_seconds
      );
    }
    position = target;
  }
  return position;
}

export function pressureWindowForDribbleAttempt(
  pattern: DribblePattern,
  trace: DribbleLaneTracePoint[],
  atSecond: number,
) {
  const playerLane = playerLaneAtSecond(pattern, trace, atSecond);
  return (
    pattern.pressure_windows.find(
      (window) =>
        atSecond >= window.start_second &&
        atSecond <= window.end_second &&
        Math.abs(playerLane - laneIndex(window.lane)) <=
          pattern.parameters.pressure_lane_radius,
    ) ?? null
  );
}

export function createDribbleDecision(
  pattern: DribblePattern,
  trace: DribbleLaneTracePoint[],
  choice: "DRIBBLE_RUN" | "SIMULATE_FOUL",
  atSecond?: number,
): DribbleDecision | null {
  if (!validateDribbleLaneTrace(pattern, trace)) return null;
  if (choice === "DRIBBLE_RUN") {
    return { choice, lane_trace: trace.map((point) => ({ ...point })) };
  }
  const simulateAt = roundDribbleSecond(atSecond ?? Number.NaN);
  if (
    !Number.isFinite(atSecond) ||
    !pressureWindowForDribbleAttempt(pattern, trace, simulateAt)
  ) {
    return null;
  }
  return {
    choice,
    lane_trace: trace.map((point) => ({ ...point })),
    simulate_at_second: simulateAt,
  };
}

export function createDribbleSubmissionGate() {
  let submittedActionId: string | null = null;
  return {
    begin(actionId: string) {
      if (submittedActionId === actionId) return false;
      submittedActionId = actionId;
      return true;
    },
    reset(actionId: string) {
      if (submittedActionId === actionId) submittedActionId = null;
    },
  };
}
