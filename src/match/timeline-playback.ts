export const KICKOFF_DWELL_MS = 1_200;
export const QUIET_MINUTE_DWELL_MS = 850;
export const EVENT_MINUTE_DWELL_MS = 1_600;

type TimelineMinuteEvent = {
  minute: number;
};

export function timelineTargetMinute(
  pendingMinute: number | null | undefined,
  currentMinute: number | null | undefined,
) {
  return pendingMinute ?? currentMinute ?? 0;
}

export function timelineMinuteDwellMs(
  minute: number,
  events: readonly TimelineMinuteEvent[],
) {
  if (events.some((event) => event.minute === minute)) {
    return EVENT_MINUTE_DWELL_MS;
  }
  return minute === 0 ? KICKOFF_DWELL_MS : QUIET_MINUTE_DWELL_MS;
}
