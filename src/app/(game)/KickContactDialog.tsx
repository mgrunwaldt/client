import { Gauge, MoveUp, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { kickContactFeedback } from "../../match/kick-contact-feedback";
import {
  ballFaceContactFromPercent,
  ballFacePercentFromContact,
  clampContactToRadius,
  type KickControlEnvelope,
} from "../../match/kick-input";
import {
  CONTACT_GRID_LABELS,
  contactForGridIndex,
  moveContactGridIndex,
} from "./kick-contact-grid";

function closestContactGridIndex(
  contact: { x: number; y: number },
  radius: number,
) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < CONTACT_GRID_LABELS.length; index += 1) {
    const candidate = contactForGridIndex(index, radius);
    const distance = Math.hypot(
      candidate.x - contact.x,
      candidate.y - contact.y,
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

export function KickContactDialog({
  envelope,
  contact,
  submittedPower,
  submitError,
  isSubmitting,
  onContactChange,
  onClose,
  onSubmit,
  showDiagnostics = false,
}: {
  envelope: KickControlEnvelope;
  contact: { x: number; y: number };
  submittedPower: number;
  submitError: string | null;
  isSubmitting: boolean;
  onContactChange: (contact: { x: number; y: number }) => void;
  onClose: () => void;
  onSubmit: () => void;
  showDiagnostics?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const contactGridRef = useRef<HTMLDivElement>(null);
  const selectedIndex = closestContactGridIndex(
    contact,
    envelope.contact_radius,
  );

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus();
  }, []);

  const selectGridContact = (index: number, focus = false) => {
    onContactChange(contactForGridIndex(index, envelope.contact_radius));
    if (focus) {
      requestAnimationFrame(() => {
        dialogRef.current
          ?.querySelector<HTMLElement>(`[data-contact-index="${index}"]`)
          ?.focus();
      });
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleContactPointer = (event: React.PointerEvent<HTMLElement>) => {
    const rect = contactGridRef.current?.getBoundingClientRect();
    if (!rect) return;
    onContactChange(
      clampContactToRadius(
        ballFaceContactFromPercent({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        }),
        envelope.contact_radius,
      ),
    );
  };

  const contactPercent = ballFacePercentFromContact(contact);
  const feedback = kickContactFeedback(submittedPower, contact);
  const announcement = `${CONTACT_GRID_LABELS[selectedIndex]} contact. ${feedback.power.label}. ${feedback.flight}. ${feedback.curve}.`;
  const CurveIcon = feedback.curve === "Curl right" ? RotateCw : RotateCcw;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-contact-title"
      aria-describedby="kick-contact-instructions"
      onKeyDown={handleDialogKeyDown}
      className="absolute inset-0 z-30 flex items-end justify-center bg-black/10 px-4 pt-[calc(var(--overgoal-safe-top)+1.5rem)] pr-[max(var(--overgoal-safe-right),1rem)] pb-[calc(var(--overgoal-safe-bottom)+1.5rem)] pl-[max(var(--overgoal-safe-left),1rem)] backdrop-blur-[1px]"
    >
      <div
        data-testid="kick-contact-panel"
        className="w-full max-w-sm rounded-[2rem] border border-cyan-300/45 bg-linear-to-b from-cyan-400/18 via-slate-950/78 to-[#14235c]/88 p-4 shadow-[0_0_40px_rgba(34,211,238,0.18)]"
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] font-bold tracking-[0.32em] text-cyan-200/80 uppercase">
              Strike Point
            </p>
            <p
              id="kick-contact-title"
              className="text-sm font-semibold text-white"
            >
              Choose where to hit the ball
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="rounded-[1.6rem] border border-cyan-200/40 bg-linear-to-b from-cyan-300/12 via-[#14235c]/78 to-[#0f1738] p-4">
          <p id="kick-contact-instructions" className="sr-only">
            Use the arrow keys to select one of nine ball contact points.
          </p>
          <div
            data-testid="kick-contact-ball"
            ref={contactGridRef}
            role="grid"
            aria-label="Ball contact point"
            className="relative mx-auto grid aspect-square w-full max-w-[min(260px,36dvh)] cursor-crosshair grid-cols-3 grid-rows-3 overflow-hidden rounded-full border-2 border-cyan-300/70 bg-radial-[circle_at_35%_35%] from-cyan-100/95 via-sky-400/28 to-[#091132] shadow-[0_0_30px_rgba(56,189,248,0.28)]"
            onPointerUp={handleContactPointer}
          >
            <div className="pointer-events-none absolute inset-[10%] rounded-full border border-cyan-200/18" />
            <div className="pointer-events-none absolute inset-[23%] rounded-full border border-cyan-200/12" />
            <div className="pointer-events-none absolute top-[10%] left-1/2 h-[80%] w-px -translate-x-1/2 bg-cyan-100/12" />
            <div className="pointer-events-none absolute top-1/2 left-[10%] h-px w-[80%] -translate-y-1/2 bg-cyan-100/12" />
            {CONTACT_GRID_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                role="gridcell"
                aria-label={`${label} contact`}
                aria-selected={selectedIndex === index}
                data-contact-index={index}
                tabIndex={selectedIndex === index ? 0 : -1}
                className="relative z-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                onPointerUp={(event) => {
                  event.stopPropagation();
                  handleContactPointer(event);
                }}
                onClick={(event) => {
                  // Keyboard activation has no pointer coordinates.
                  if (event.detail === 0) selectGridContact(index);
                }}
                onKeyDown={(event) => {
                  if (!event.key.startsWith("Arrow")) return;
                  event.preventDefault();
                  selectGridContact(
                    moveContactGridIndex(
                      index,
                      event.key as
                        | "ArrowUp"
                        | "ArrowDown"
                        | "ArrowLeft"
                        | "ArrowRight",
                    ),
                    true,
                  );
                }}
              />
            ))}
            <div
              aria-hidden="true"
              data-testid="kick-contact-marker"
              className="pointer-events-none absolute z-20 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-orange-400/95 shadow-[0_0_22px_rgba(251,146,60,0.65)]"
              style={{
                left: `${contactPercent.x}%`,
                top: `${contactPercent.y}%`,
              }}
            >
              <div className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200/90" />
              <div className="absolute top-1/2 left-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
              <div className="absolute top-1/2 left-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          <div className="mt-4 grid grid-cols-[1.2fr_1fr_1fr] gap-2">
            <div
              data-testid="kick-power-feedback"
              aria-label={`${feedback.power.label} power`}
              className="rounded-2xl border border-cyan-200/15 bg-black/24 px-3 py-2"
            >
              <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.2em] text-cyan-100/60 uppercase">
                <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
                Power
              </div>
              <p className="mt-1 text-xs font-black tracking-wide text-white uppercase">
                {feedback.power.label}
              </p>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={`h-1.5 flex-1 skew-x-[-12deg] rounded-sm ${
                      level <= feedback.power.level
                        ? "bg-linear-to-r from-cyan-300 to-lime-300 shadow-[0_0_8px_rgba(103,232,249,0.55)]"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div
              data-testid="kick-flight-feedback"
              className="rounded-2xl border border-cyan-200/15 bg-black/24 px-2 py-2 text-center"
            >
              <MoveUp
                aria-hidden="true"
                className={`mx-auto h-5 w-5 text-cyan-200 ${
                  feedback.flight === "Skimming"
                    ? "rotate-90"
                    : feedback.flight === "Lofted"
                      ? "-translate-y-0.5"
                      : ""
                }`}
              />
              <p className="mt-1 text-[9px] font-bold tracking-[0.18em] text-cyan-100/55 uppercase">
                Flight
              </p>
              <p className="text-[11px] font-black text-white uppercase">
                {feedback.flight}
              </p>
            </div>
            <div
              data-testid="kick-curve-feedback"
              className="rounded-2xl border border-cyan-200/15 bg-black/24 px-2 py-2 text-center"
            >
              <CurveIcon
                aria-hidden="true"
                className={`mx-auto h-5 w-5 ${
                  feedback.curve === "Straight"
                    ? "text-white/35"
                    : "text-fuchsia-300"
                }`}
              />
              <p className="mt-1 text-[9px] font-bold tracking-[0.18em] text-cyan-100/55 uppercase">
                Bend
              </p>
              <p className="text-[11px] font-black text-white uppercase">
                {feedback.curve}
              </p>
            </div>
          </div>
          {showDiagnostics && (
            <div
              data-testid="kick-development-diagnostics"
              className="mt-2 rounded-xl border border-amber-300/30 bg-black/45 px-3 py-2 font-mono text-[10px] text-amber-100/80"
            >
              DEV · power {submittedPower.toFixed(4)} · contact{" "}
              {contact.x.toFixed(4)}, {contact.y.toFixed(4)} · envelope{" "}
              {envelope.minimum_power.toFixed(4)}-
              {envelope.maximum_power.toFixed(4)}
            </div>
          )}
          {submitError && (
            <div
              role="alert"
              className="mt-3 rounded-2xl border border-red-400/25 bg-red-950/40 px-3 py-2 text-xs text-red-100"
            >
              {submitError}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="kick-submit"
          disabled={isSubmitting}
          className="mt-4 w-full rounded-2xl bg-linear-to-b from-amber-300 via-orange-400 to-red-500 px-4 py-3 text-center text-2xl font-black tracking-[0.12em] text-white uppercase shadow-[0_10px_26px_rgba(249,115,22,0.42)]"
          onClick={onSubmit}
        >
          {isSubmitting ? "Kicking..." : "Kick"}
        </button>
      </div>
    </div>
  );
}
