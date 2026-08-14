import React from "react";

import { cn } from "../../../../utils/utils";

interface MatchEvent {
  id: string;
  minute: number;
  text: string;
  type:
    | "team-goal"
    | "opponent-goal"
    | "team-opportunity"
    | "opponent-opportunity"
    | "team-possession"
    | "opponent-possession"
    | "disciplinary"
    | "interval"
    | "neutral";
}

interface EventFeedProps {
  events: MatchEvent[];
  currentMinute: number;
  advancing?: boolean;
  opportunityIncoming?: boolean;
}

const presentationByType: Record<
  MatchEvent["type"],
  { accent: string; eyebrow: string; recent: string; stripe: string }
> = {
  neutral: {
    accent: "border-cyan-300/45 bg-cyan-950/45 text-white",
    eyebrow: "Match pulse",
    recent: "border-cyan-300/15 bg-cyan-950/25 text-cyan-50/72",
    stripe: "from-cyan-200 via-cyan-400 to-blue-500",
  },
  "team-goal": {
    accent: "border-lime-300/65 bg-emerald-950/65 text-lime-100",
    eyebrow: "Goal - your team",
    recent: "border-lime-300/20 bg-emerald-950/35 text-lime-100/80",
    stripe: "from-white via-lime-300 to-emerald-500",
  },
  "opponent-goal": {
    accent: "border-pink-400/65 bg-[#540e40]/75 text-pink-100",
    eyebrow: "Goal - opposition",
    recent: "border-pink-400/20 bg-[#540e40]/40 text-pink-100/80",
    stripe: "from-white via-pink-400 to-red-500",
  },
  "team-opportunity": {
    accent: "border-cyan-300/60 bg-[#002f2b]/75 text-cyan-50",
    eyebrow: "Your team attacks",
    recent: "border-cyan-300/20 bg-[#002f2b]/35 text-cyan-50/78",
    stripe: "from-cyan-100 via-cyan-300 to-lime-300",
  },
  "opponent-opportunity": {
    accent: "border-orange-300/55 bg-[#3b162b]/75 text-orange-50",
    eyebrow: "Danger",
    recent: "border-orange-300/20 bg-[#3b162b]/40 text-orange-50/78",
    stripe: "from-amber-200 via-orange-400 to-pink-500",
  },
  "team-possession": {
    accent: "border-sky-300/55 bg-[#032743]/75 text-sky-50",
    eyebrow: "Possession secured",
    recent: "border-sky-300/20 bg-[#032743]/40 text-sky-50/78",
    stripe: "from-white via-sky-300 to-cyan-500",
  },
  "opponent-possession": {
    accent: "border-orange-300/50 bg-[#321727]/75 text-orange-50",
    eyebrow: "Possession lost",
    recent: "border-orange-300/20 bg-[#321727]/40 text-orange-50/78",
    stripe: "from-yellow-200 via-orange-400 to-pink-500",
  },
  disciplinary: {
    accent: "border-amber-300/65 bg-[#332006]/80 text-amber-50",
    eyebrow: "Flashpoint",
    recent: "border-amber-300/20 bg-[#332006]/45 text-amber-50/80",
    stripe: "from-yellow-100 via-amber-300 to-red-500",
  },
  interval: {
    accent: "border-fuchsia-300/55 bg-[#17113c]/80 text-fuchsia-50",
    eyebrow: "Match interval",
    recent: "border-fuchsia-300/20 bg-[#17113c]/45 text-fuchsia-50/78",
    stripe: "from-cyan-200 via-fuchsia-400 to-violet-500",
  },
};

export const EventFeed: React.FC<EventFeedProps> = ({
  events,
  currentMinute,
  advancing = false,
  opportunityIncoming = false,
}) => {
  const currentEvent = events
    .slice()
    .reverse()
    .find((event) => event.minute === currentMinute);
  const recentEvents = events
    .filter((event) => event.id !== currentEvent?.id)
    .slice(-2);

  return (
    <section
      aria-label="Match commentary"
      data-testid="match-event-feed"
      data-current-event-id={currentEvent?.id}
      className="relative flex min-h-28 w-full max-w-2xl flex-1 flex-col justify-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#010817]/76 p-3 shadow-[inset_0_0_28px_rgba(34,211,238,0.04)]"
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/55 to-transparent" />
      {(advancing || opportunityIncoming) && (
        <div
          data-testid="timeline-transition-feedback"
          role="status"
          className="font-orbitron mb-2 flex shrink-0 items-center justify-center gap-2 text-[9px] font-bold tracking-[0.25em] text-cyan-200 uppercase"
        >
          <span className="timeline-feed-pulse h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
          {opportunityIncoming ? "Opportunity incoming" : "Reading the play"}
        </div>
      )}

      {!currentEvent ? (
        <div className="flex min-h-24 flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="timeline-feed-pulse h-1 w-3/4 overflow-hidden rounded-full bg-cyan-950">
            <div className="h-full w-1/3 bg-linear-to-r from-transparent via-cyan-300 to-transparent" />
          </div>
          <div>
            <p className="font-orbitron text-[10px] tracking-[0.3em] text-cyan-300/70 uppercase">
              Match in motion
            </p>
            <p className="mt-1 text-sm text-white/60">
              The next opening is building.
            </p>
          </div>
        </div>
      ) : (
        <>
          {recentEvents.length > 0 && (
            <div
              className="mb-2 flex gap-2 overflow-hidden"
              aria-label="Recent moments"
            >
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  data-event-id={event.id}
                  data-event-type={event.type}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5",
                    presentationByType[event.type].recent,
                  )}
                >
                  <span className="font-orbitron shrink-0 text-[10px] font-bold tabular-nums">
                    {event.minute}'
                  </span>
                  <span className="truncate text-[10px]">{event.text}</span>
                </div>
              ))}
            </div>
          )}

          <article
            key={currentEvent.id}
            data-event-id={currentEvent.id}
            data-event-type={currentEvent.type}
            data-score-link={
              currentEvent.type === "team-goal" ||
              currentEvent.type === "opponent-goal"
                ? currentEvent.id
                : undefined
            }
            aria-live="polite"
            className={cn(
              "event-feed-item relative overflow-hidden rounded-xl border px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.24)]",
              presentationByType[currentEvent.type].accent,
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b shadow-[0_0_14px_rgba(34,211,238,0.7)]",
                presentationByType[currentEvent.type].stripe,
              )}
            />
            <div className="flex items-center justify-between gap-4 pl-1">
              <p className="font-orbitron text-[9px] font-bold tracking-[0.24em] uppercase opacity-65">
                {presentationByType[currentEvent.type].eyebrow}
              </p>
              <span className="font-orbitron shrink-0 text-sm font-black tabular-nums">
                {currentEvent.minute}'
              </span>
            </div>
            <p className="font-orbitron mt-1 pl-1 text-center text-sm leading-snug font-semibold tracking-wide">
              {currentEvent.text}
            </p>
          </article>
        </>
      )}
    </section>
  );
};
