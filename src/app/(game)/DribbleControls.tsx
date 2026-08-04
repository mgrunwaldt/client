import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  canSwitchDribbleLane,
  createDribbleDecision,
  DRIBBLE_LANES,
  type DribbleDecision,
  type DribbleLane,
  type DribbleLaneTracePoint,
  type DribblePattern,
  elapsedDribbleSeconds,
  pressureWindowForDribbleAttempt,
  roundDribbleSecond,
} from "../../match/dribble-input";

const SWIPE_THRESHOLD_PX = 28;

function laneLabel(lane: DribbleLane) {
  return lane.charAt(0) + lane.slice(1).toLowerCase();
}

function laneProgress(lane: DribbleLane) {
  return (DRIBBLE_LANES.indexOf(lane) / (DRIBBLE_LANES.length - 1)) * 100;
}

export function DribbleControls({
  pattern,
  disabled,
  onLaneChange,
  onSubmit,
}: {
  pattern: DribblePattern;
  disabled: boolean;
  onLaneChange: (lane: DribbleLane) => void;
  onSubmit: (decision: DribbleDecision) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [trace, setTrace] = useState<DribbleLaneTracePoint[]>([
    { at_second: 0, lane: pattern.starting_lane },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const traceRef = useRef(trace);
  const elapsedRef = useRef(0);
  const submittedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const swipeStartRef = useRef<number | null>(null);
  const pointerLaneRef = useRef<DribbleLane | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const touchLaneRef = useRef<DribbleLane | null>(null);
  const gestureHandledRef = useRef(false);
  const e2eClockPausedRef = useRef(false);

  const submitDecision = (
    choice: "DRIBBLE_RUN" | "SIMULATE_FOUL",
    atSecond?: number,
  ) => {
    if (submittedRef.current || disabled) return;
    const decision = createDribbleDecision(
      pattern,
      traceRef.current,
      choice,
      atSecond,
    );
    if (!decision) return;
    submittedRef.current = true;
    setSubmitted(true);
    onSubmit(decision);
  };
  const completeRun = useEffectEvent(() => submitDecision("DRIBBLE_RUN"));

  useEffect(() => {
    if (disabled) return;
    const tick = (now: number) => {
      if (e2eClockPausedRef.current) return;
      if (startedAtRef.current === null) {
        startedAtRef.current = now;
        setStartedAt(now);
      }
      const nextElapsed = elapsedDribbleSeconds(
        startedAtRef.current,
        now,
        pattern.duration_seconds,
      );
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (nextElapsed >= pattern.duration_seconds) {
        completeRun();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [disabled, pattern.duration_seconds]);

  useEffect(() => {
    if (import.meta.env.VITE_E2E_MATCH_SESSION_BRIDGE !== "true") return;
    const bridge = globalThis as typeof globalThis & {
      __OVERGOAL_E2E_DRIBBLE_ADVANCE__?: (second: number) => void;
    };
    bridge.__OVERGOAL_E2E_DRIBBLE_ADVANCE__ = (second) => {
      const nextElapsed = Math.max(
        0,
        Math.min(pattern.duration_seconds, second),
      );
      e2eClockPausedRef.current = true;
      startedAtRef.current = performance.now() - nextElapsed * 1000;
      setStartedAt(startedAtRef.current);
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
      if (nextElapsed >= pattern.duration_seconds) completeRun();
    };
    return () => {
      delete bridge.__OVERGOAL_E2E_DRIBBLE_ADVANCE__;
    };
  }, [pattern.duration_seconds]);

  const currentLane = trace[trace.length - 1]?.lane ?? pattern.starting_lane;
  const roundedElapsed = roundDribbleSecond(elapsed);
  const pressureWindow = pressureWindowForDribbleAttempt(
    pattern,
    trace,
    roundedElapsed,
  );
  const canSimulate = Boolean(pressureWindow) && !disabled && !submitted;

  const switchLane = (nextLane: DribbleLane, eventTime: number) => {
    const inputElapsed =
      e2eClockPausedRef.current || startedAtRef.current === null
        ? elapsedRef.current
        : elapsedDribbleSeconds(
            startedAtRef.current,
            eventTime,
            pattern.duration_seconds,
          );
    if (
      disabled ||
      submittedRef.current ||
      !canSwitchDribbleLane(pattern, traceRef.current, nextLane, inputElapsed)
    ) {
      return;
    }
    const nextTrace = [
      ...traceRef.current,
      { at_second: roundDribbleSecond(inputElapsed), lane: nextLane },
    ];
    elapsedRef.current = inputElapsed;
    traceRef.current = nextTrace;
    setTrace(nextTrace);
    onLaneChange(nextLane);
  };

  const switchRelative = (direction: -1 | 1, eventTime: number) => {
    const next = DRIBBLE_LANES[DRIBBLE_LANES.indexOf(currentLane) + direction];
    if (next) switchLane(next, eventTime);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      switchRelative(-1, event.timeStamp);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      switchRelative(1, event.timeStamp);
    }
  };

  const finishLaneGesture = (
    start: number,
    end: number,
    tappedLane: DribbleLane | null,
    eventTime: number,
  ) => {
    if (gestureHandledRef.current) return;
    gestureHandledRef.current = true;
    const distance = end - start;
    if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) {
      switchRelative(distance > 0 ? 1 : -1, eventTime);
    } else if (tappedLane) {
      switchLane(tappedLane, eventTime);
    }
  };

  const laneFromTarget = (target: EventTarget | null) => {
    const lane = (target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-dribble-lane]",
    )?.dataset.dribbleLane;
    return DRIBBLE_LANES.includes(lane as DribbleLane)
      ? (lane as DribbleLane)
      : null;
  };

  const clearGesture = () => {
    swipeStartRef.current = null;
    pointerLaneRef.current = null;
    touchStartRef.current = null;
    touchLaneRef.current = null;
  };

  return (
    <section
      data-testid="dribble-controls"
      data-lane-trace={JSON.stringify(trace)}
      data-run-started-at-ms={startedAt ?? ""}
      aria-label="Dribble challenge"
      aria-describedby="dribble-instructions"
      className="absolute inset-x-0 top-0 z-30 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white sm:px-5"
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-[1.65rem] border border-cyan-300/55 bg-[linear-gradient(140deg,rgba(3,19,52,0.94),rgba(5,39,67,0.91)_55%,rgba(40,8,67,0.92))] shadow-[0_0_35px_rgba(34,211,238,0.22),inset_0_1px_rgba(255,255,255,0.16)] backdrop-blur-md">
        <div className="border-b border-cyan-300/25 px-4 pt-3 pb-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.3em] text-cyan-200 uppercase">
                Dribble Run
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                Beat the pressure. Choose a lane.
              </p>
            </div>
            <output
              aria-label={`${Math.max(0, pattern.duration_seconds - elapsed).toFixed(1)} seconds remaining`}
              className="rounded-lg border border-fuchsia-300/55 bg-fuchsia-500/15 px-2 py-1 font-mono text-lg font-black tracking-[0.12em] text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.26)]"
            >
              {Math.max(0, pattern.duration_seconds - elapsed).toFixed(1)}
            </output>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#b8ff4d_55%,#f472b6)] transition-[width] duration-100"
              style={{
                width: `${(elapsed / pattern.duration_seconds) * 100}%`,
              }}
            />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Dribble lane"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            gestureHandledRef.current = false;
            swipeStartRef.current = event.clientX;
            pointerLaneRef.current = laneFromTarget(event.target);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const start = swipeStartRef.current;
            const tappedLane = pointerLaneRef.current;
            if (start === null) return;
            finishLaneGesture(
              start,
              event.clientX,
              tappedLane,
              event.timeStamp,
            );
            clearGesture();
          }}
          onPointerCancel={() => {
            swipeStartRef.current = null;
            pointerLaneRef.current = null;
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            gestureHandledRef.current = false;
            touchStartRef.current = touch.clientX;
            touchLaneRef.current = laneFromTarget(event.target);
          }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            const touch = event.changedTouches[0];
            if (start === null || !touch) return;
            finishLaneGesture(
              start,
              touch.clientX,
              touchLaneRef.current,
              event.timeStamp,
            );
            clearGesture();
          }}
          className="relative mx-3 mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-cyan-200/20 bg-slate-950/45 p-2 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          // The match field is a fixed game surface, not a scroll container.
          // Owning the gesture prevents mobile browsers from cancelling a
          // horizontal lane swipe before pointerup is delivered.
          style={{ touchAction: "none" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lime-200/80 bg-lime-300/20 shadow-[0_0_20px_rgba(190,242,100,0.52)] transition-[left] duration-200 motion-reduce:transition-none"
            style={{
              left: `calc(${laneProgress(currentLane)}% / 1.5 + 16.6667%)`,
            }}
          />
          {DRIBBLE_LANES.map((lane) => {
            const selected = lane === currentLane;
            const isReachable =
              lane === currentLane ||
              canSwitchDribbleLane(pattern, trace, lane, elapsed);
            return (
              <button
                key={lane}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${laneLabel(lane)} lane${selected ? ", selected" : ""}`}
                data-dribble-lane={lane}
                data-testid={`dribble-lane-${lane.toLowerCase()}`}
                disabled={disabled || !isReachable}
                className={`relative min-h-14 rounded-xl border px-2 py-2 text-xs font-black tracking-[0.16em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:opacity-45 ${
                  selected
                    ? "border-lime-200/80 bg-lime-300/14 text-lime-100"
                    : "border-cyan-200/22 bg-cyan-400/5 text-cyan-100"
                }`}
                onClick={(event) => switchLane(lane, event.timeStamp)}
              >
                <span className="block text-[9px] text-cyan-200/70">Lane</span>
                {laneLabel(lane)}
              </button>
            );
          })}
        </div>

        <p
          id="dribble-instructions"
          className="px-4 pt-2 text-center text-[11px] text-cyan-100/75"
        >
          Tap a neighbouring lane, swipe left or right, or use the arrow keys.
        </p>
        <p aria-live="polite" className="sr-only">
          {`${laneLabel(currentLane)} lane. ${pressureWindow ? "Pressure window active." : "No pressure window."}`}
        </p>

        <div className="grid grid-cols-[1fr_auto] gap-2 px-3 pt-3 pb-3">
          <div className="rounded-xl border border-cyan-200/16 bg-black/25 px-3 py-2 text-[10px] tracking-[0.12em] text-cyan-100/75 uppercase">
            Trace: {trace.length} input{trace.length === 1 ? "" : "s"}
          </div>
          <button
            type="button"
            data-testid="dribble-simulate-foul"
            disabled={!canSimulate}
            className="min-h-11 rounded-xl border border-amber-300/55 bg-[linear-gradient(135deg,rgba(251,146,60,0.32),rgba(244,63,94,0.28))] px-3 text-xs font-black tracking-[0.1em] text-amber-50 uppercase shadow-[0_0_16px_rgba(251,146,60,0.2)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/35 disabled:shadow-none"
            onClick={() => submitDecision("SIMULATE_FOUL", elapsedRef.current)}
          >
            Simulate Foul
            {pressureWindow
              ? ` ${pattern.parameters.simulation_chance_percent}%`
              : ""}
          </button>
        </div>
      </div>
    </section>
  );
}
