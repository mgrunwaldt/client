import type {
  BackendDecisionResult,
  BackendPendingAction,
  BackendUnsupportedSceneRecovery,
} from "../../match/api-v1/contract";
import {
  type ParsedRandomEvent,
  randomEventImmediateEffects,
  randomEventPendingSettlements,
} from "../../match/random-event";

const EVENT_ACCENTS = {
  JUMPER: "from-lime-300 via-cyan-300 to-sky-400",
  ARGUMENT_OPPONENT: "from-orange-300 via-pink-400 to-fuchsia-400",
  ARGUMENT_TEAMMATE: "from-yellow-300 via-orange-300 to-pink-400",
  BRAWL: "from-red-400 via-pink-400 to-fuchsia-400",
  BATHROOM: "from-cyan-300 via-sky-300 to-lime-300",
} as const;

function EventFrame({
  sceneType,
}: {
  sceneType: ParsedRandomEvent["sceneType"];
}) {
  return (
    <>
      <div className="absolute inset-x-5 top-5 h-px bg-cyan-200/50" />
      <div className="absolute top-5 right-5 bottom-5 w-px bg-cyan-200/35" />
      <div className="absolute bottom-5 left-5 h-px w-14 bg-fuchsia-300/65" />
      <div
        aria-hidden="true"
        className={`absolute top-0 right-[12%] left-[12%] h-1 bg-linear-to-r ${EVENT_ACCENTS[sceneType]} opacity-90 shadow-[0_0_22px_rgba(34,211,238,0.65)]`}
      />
    </>
  );
}

export function RandomEventScene({
  action,
  event,
  disabled,
  onChoose,
}: {
  action: BackendPendingAction;
  event: ParsedRandomEvent;
  disabled: boolean;
  onChoose: (choiceId: string) => void;
}) {
  return (
    <section
      data-testid="random-event-scene"
      data-scene-type={event.sceneType}
      aria-labelledby="random-event-title"
      className="absolute inset-0 z-30 flex min-h-dvh items-end overflow-hidden px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] sm:items-center sm:justify-center"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(34,211,238,0.2),transparent_32%),radial-gradient(circle_at_76%_62%,rgba(217,70,239,0.2),transparent_29%),linear-gradient(180deg,rgba(2,8,22,0.2),rgba(2,8,22,0.9))]" />
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-cyan-200/35 bg-slate-950/94 px-5 py-6 shadow-[0_0_48px_rgba(34,211,238,0.2)] backdrop-blur-xl sm:px-7 sm:py-8">
        <EventFrame sceneType={event.sceneType} />
        <div className="relative">
          <p className="font-orbitron text-[10px] font-black tracking-[0.3em] text-cyan-200 uppercase">
            Match Event · {action.minute}'
          </p>
          <h1
            id="random-event-title"
            className="font-orbitron mt-3 text-2xl font-black tracking-[0.025em] text-white uppercase sm:text-3xl"
          >
            {action.title}
          </h1>
          <p className="mt-3 max-w-[34ch] text-sm leading-6 text-cyan-50/80 sm:text-base">
            {action.description}
          </p>

          <div
            role="group"
            aria-label={`${action.title} choices`}
            className="mt-6 grid gap-3"
          >
            {event.choices.map((choice, index) => (
              <button
                key={choice.id}
                type="button"
                data-testid={`random-event-choice-${choice.id}`}
                disabled={disabled}
                onClick={() => onChoose(choice.id)}
                className="group relative min-h-20 overflow-hidden rounded-2xl border border-cyan-300/30 bg-cyan-300/5 px-4 py-3 text-left transition duration-200 hover:border-cyan-200/80 hover:bg-cyan-300/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-wait disabled:opacity-55"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-cyan-200 via-sky-400 to-fuchsia-400 opacity-70 transition group-hover:w-1.5" />
                <span className="font-orbitron flex items-start gap-3 text-sm font-black tracking-[0.08em] text-cyan-50 uppercase">
                  <span className="text-cyan-300/80">0{index + 1}</span>
                  <span>{choice.label}</span>
                </span>
                <span className="mt-1 block pl-7 text-xs leading-5 text-cyan-50/62">
                  {choice.description}
                </span>
              </button>
            ))}
          </div>
          <p
            aria-live="polite"
            className="mt-4 text-center text-[11px] text-cyan-100/55"
          >
            {disabled
              ? "Submitting your choice to the match service."
              : "Your choice is resolved by the live match service."}
          </p>
        </div>
      </div>
    </section>
  );
}

export function RandomEventResultDetails({
  result,
}: {
  result: BackendDecisionResult | undefined;
}) {
  const effects = randomEventImmediateEffects(
    result?.immediate_effects,
    result,
  );
  const settlements = randomEventPendingSettlements(
    result?.pending_settlement_events,
  );

  if (effects.length === 0 && settlements.length === 0) return null;

  return (
    <section
      data-testid="random-event-result-details"
      aria-label="Authoritative match consequences"
      className="mt-4 space-y-3 border-t border-cyan-200/15 pt-4"
    >
      {effects.length > 0 && (
        <div>
          <p className="font-orbitron text-[10px] font-black tracking-[0.24em] text-cyan-200/75 uppercase">
            Immediate Match Effects
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {effects.map((item, index) => (
              <div
                key={`${item.label}-${item.value}-${index}`}
                className="rounded-xl border border-white/8 bg-white/4 px-3 py-2"
              >
                <dt className="text-[10px] font-bold tracking-[0.16em] text-white/48 uppercase">
                  {item.label}
                </dt>
                <dd
                  className={`mt-1 text-xs font-semibold ${
                    item.tone === "positive"
                      ? "text-lime-200"
                      : item.tone === "negative"
                        ? "text-pink-200"
                        : "text-cyan-100"
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {settlements.length > 0 && (
        <div>
          <p className="font-orbitron text-[10px] font-black tracking-[0.24em] text-fuchsia-200/85 uppercase">
            Pending Beyond This Match
          </p>
          <ul className="mt-2 space-y-2">
            {settlements.map((settlement) => (
              <li
                key={settlement.id}
                className="rounded-xl border border-fuchsia-300/16 bg-fuchsia-300/5 px-3 py-2"
              >
                <p className="text-xs font-bold text-fuchsia-100">
                  {settlement.label}
                </p>
                {settlement.description && (
                  <p className="mt-1 text-[11px] leading-4 text-fuchsia-50/65">
                    {settlement.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The server explicitly authorizes this exact no-effect recovery action. */
export function UnsupportedEventRecovery({
  recovery,
  disabled,
  onContinue,
}: {
  recovery: BackendUnsupportedSceneRecovery;
  disabled: boolean;
  onContinue: () => void;
}) {
  return (
    <section
      data-testid="unsupported-event-recovery"
      aria-labelledby="unsupported-event-title"
      className="absolute inset-0 z-40 flex min-h-dvh items-center px-4 py-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(217,70,239,0.22),transparent_34%),linear-gradient(180deg,rgba(2,8,22,0.52),rgba(2,8,22,0.94))]" />
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-fuchsia-300/40 bg-slate-950/95 px-5 py-7 shadow-[0_0_52px_rgba(217,70,239,0.22)] sm:px-7">
        <EventFrame sceneType="BRAWL" />
        <p className="font-orbitron text-[10px] font-black tracking-[0.3em] text-fuchsia-200 uppercase">
          Match Service Recovery
        </p>
        <h1
          id="unsupported-event-title"
          className="font-orbitron mt-3 text-2xl font-black tracking-[0.02em] text-white uppercase"
        >
          Unsupported Event
        </h1>
        <p className="mt-3 text-sm leading-6 text-cyan-50/82">
          The live match contains {recovery.scene_type}. This client cannot
          render that event safely.
        </p>
        <div className="mt-5 rounded-2xl border border-cyan-200/20 bg-cyan-300/6 px-4 py-3">
          <p className="font-orbitron text-xs font-black tracking-[0.08em] text-cyan-100 uppercase">
            {recovery.recovery.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-50/65">
            {recovery.recovery.description}
          </p>
        </div>
        <button
          type="button"
          data-testid="unsupported-event-continue"
          disabled={disabled}
          onClick={onContinue}
          className="font-orbitron mt-6 min-h-14 w-full rounded-2xl border border-cyan-200/70 bg-cyan-300/12 px-4 text-sm font-black tracking-[0.15em] text-cyan-50 uppercase transition hover:bg-cyan-300/22 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-wait disabled:opacity-55"
        >
          {disabled ? "Contacting Match Service" : recovery.recovery.label}
        </button>
      </div>
    </section>
  );
}
