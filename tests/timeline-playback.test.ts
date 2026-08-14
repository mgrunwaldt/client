import { describe, expect, it } from "vitest";

import {
  EVENT_MINUTE_DWELL_MS,
  KICKOFF_DWELL_MS,
  QUIET_MINUTE_DWELL_MS,
  timelineMinuteDwellMs,
  timelineTargetMinute,
} from "../src/match/timeline-playback";

describe("timeline playback target", () => {
  it("preserves an authoritative minute-zero action", () => {
    expect(timelineTargetMinute(0, 12)).toBe(0);
    expect(timelineTargetMinute(null, 12)).toBe(12);
  });

  it("gives kickoff, quiet minutes, and event minutes explicit dwell times", () => {
    const events = [{ minute: 4 }, { minute: 12 }];

    expect(timelineMinuteDwellMs(0, events)).toBe(KICKOFF_DWELL_MS);
    expect(timelineMinuteDwellMs(3, events)).toBe(QUIET_MINUTE_DWELL_MS);
    expect(timelineMinuteDwellMs(4, events)).toBe(EVENT_MINUTE_DWELL_MS);
  });

  it("treats every event at the displayed minute as one readable beat", () => {
    expect(
      timelineMinuteDwellMs(7, [{ minute: 7 }, { minute: 7 }, { minute: 8 }]),
    ).toBe(EVENT_MINUTE_DWELL_MS);
  });
});
