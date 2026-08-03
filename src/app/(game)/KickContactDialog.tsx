import { useEffect, useRef } from "react";

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
}: {
  envelope: KickControlEnvelope;
  contact: { x: number; y: number };
  submittedPower: number;
  submitError: string | null;
  isSubmitting: boolean;
  onContactChange: (contact: { x: number; y: number }) => void;
  onClose: () => void;
  onSubmit: () => void;
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
  const announcement = `${CONTACT_GRID_LABELS[selectedIndex]} contact, x ${contact.x.toFixed(2)}, y ${contact.y.toFixed(2)}`;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kick-contact-title"
      aria-describedby="kick-contact-instructions"
      onKeyDown={handleDialogKeyDown}
      className="bg-black/18 absolute inset-0 z-30 flex items-end justify-center px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] backdrop-blur-[1px]"
    >
      <div className="bg-linear-to-b from-cyan-400/18 via-slate-950/88 to-[#14235c]/92 w-full max-w-sm rounded-[2rem] border border-cyan-300/45 p-4 shadow-[0_0_40px_rgba(34,211,238,0.18)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-200/80">
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

        <div className="bg-linear-to-b from-cyan-300/12 via-[#14235c]/78 rounded-[1.6rem] border border-cyan-200/40 to-[#0f1738] p-4">
          <p id="kick-contact-instructions" className="sr-only">
            Use the arrow keys to select one of nine ball contact points.
          </p>
          <div
            data-testid="kick-contact-ball"
            ref={contactGridRef}
            role="grid"
            aria-label="Ball contact point"
            className="bg-radial-[circle_at_35%_35%] via-sky-400/28 relative mx-auto grid aspect-square w-full max-w-[260px] cursor-crosshair grid-cols-3 grid-rows-3 overflow-hidden rounded-full border-2 border-cyan-300/70 from-cyan-100/95 to-[#091132] shadow-[0_0_30px_rgba(56,189,248,0.28)]"
            onPointerUp={handleContactPointer}
          >
            <div className="border-cyan-200/18 pointer-events-none absolute inset-[10%] rounded-full border" />
            <div className="border-cyan-200/12 pointer-events-none absolute inset-[23%] rounded-full border" />
            <div className="bg-cyan-100/12 pointer-events-none absolute left-1/2 top-[10%] h-[80%] w-px -translate-x-1/2" />
            <div className="bg-cyan-100/12 pointer-events-none absolute left-[10%] top-1/2 h-px w-[80%] -translate-y-1/2" />
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
              className="pointer-events-none absolute z-20 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-orange-400/95 shadow-[0_0_22px_rgba(251,146,60,0.65)]"
              style={{
                left: `${contactPercent.x}%`,
                top: `${contactPercent.y}%`,
              }}
            >
              <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200/90" />
              <div className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
              <div className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          <div className="text-white/72 mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-black/22 rounded-2xl px-3 py-2">
              Submitted power: {Math.round(submittedPower * 100)}%
            </div>
            <div className="bg-black/22 rounded-2xl px-3 py-2">
              Contact: {contact.x.toFixed(2)}, {contact.y.toFixed(2)}
            </div>
            <div className="bg-black/22 col-span-2 rounded-2xl px-3 py-2">
              Server power range: {Math.round(envelope.minimum_power * 100)}% -{" "}
              {Math.round(envelope.maximum_power * 100)}%; short pulls use the
              server floor.
            </div>
          </div>
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
          className="bg-linear-to-b mt-4 w-full rounded-2xl from-amber-300 via-orange-400 to-red-500 px-4 py-3 text-center text-2xl font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_26px_rgba(249,115,22,0.42)]"
          onClick={onSubmit}
        >
          {isSubmitting ? "Kicking..." : "Kick"}
        </button>
      </div>
    </div>
  );
}
