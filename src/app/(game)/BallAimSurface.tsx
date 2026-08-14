import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { type PointerEvent, useEffect, useRef } from "react";
import * as THREE from "three";

import { screenPointToWorldPlane } from "../../match/field-camera";
import { type BallAimDraft, buildBallAimDraft } from "../../match/kick-gesture";

const REQUIRED_STABLE_FOCUS_FRAMES = 2;
const FOCUS_RETRY_INTERVAL_MS = 50;

interface BallAimSurfaceProps {
  position: [number, number, number];
  maximumPower: number;
  enabled?: boolean;
  focusOnMount?: boolean;
  onFocusRestored?: () => void;
  onAimChange: (draft: BallAimDraft | null) => void;
  onAimRelease: (draft: BallAimDraft) => void;
}

function aimPointFromEvent(
  event: PointerEvent<HTMLButtonElement>,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  height: number,
) {
  const bounds = canvas.getBoundingClientRect();
  return screenPointToWorldPlane(
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    camera,
    { width: bounds.width, height: bounds.height },
    height,
  );
}

// Html projects through the active R3F camera, keeping this accessible hit target
// precisely over the visible ball for both mouse and touch interaction.
export function BallAimSurface({
  position,
  maximumPower,
  enabled = true,
  focusOnMount = false,
  onFocusRestored,
  onAimChange,
  onAimRelease,
}: BallAimSurfaceProps) {
  const { camera, gl } = useThree();
  const targetRef = useRef<HTMLButtonElement>(null);
  const dragStartRef = useRef<THREE.Vector3 | null>(null);
  const dragCurrentRef = useRef<THREE.Vector3 | null>(null);
  const dragStartScreenRef = useRef<{ x: number; y: number } | null>(null);
  const dragScreenDistanceRef = useRef(0);

  useEffect(() => {
    if (!enabled || !focusOnMount) return;

    // Html mounts its DOM target through the R3F portal. Native autoFocus can
    // run before that target is attached when the contact dialog closes.
    let frame: number | null = null;
    let retryTimer: number | null = null;
    let stableFrames = 0;
    let finished = false;
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (retryTimer !== null) clearTimeout(retryTimer);
      observer?.disconnect();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onFocusRestored?.();
    };
    const scheduleFocus = () => {
      if (finished || frame !== null || retryTimer !== null) return;
      frame = requestAnimationFrame(restoreFocus);
    };
    const scheduleRetry = () => {
      if (finished || frame !== null || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        scheduleFocus();
      }, FOCUS_RETRY_INTERVAL_MS);
    };
    const restoreFocus = () => {
      frame = null;
      const target = targetRef.current;
      if (!target?.isConnected) {
        stableFrames = 0;
        scheduleRetry();
        return;
      }
      target.focus({ preventScroll: true });
      if (document.activeElement === target) {
        stableFrames += 1;
        if (stableFrames >= REQUIRED_STABLE_FOCUS_FRAMES) {
          finish();
          return;
        }
      } else {
        stableFrames = 0;
      }
      scheduleRetry();
    };

    observer = new MutationObserver(scheduleFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleFocus();
    return cleanup;
  }, [enabled, focusOnMount, onFocusRestored]);

  const clearDrag = () => {
    dragStartRef.current = null;
    dragCurrentRef.current = null;
    dragStartScreenRef.current = null;
    dragScreenDistanceRef.current = 0;
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const start = new THREE.Vector3(...position);
    dragStartRef.current = start;
    dragCurrentRef.current = start.clone();
    dragStartScreenRef.current = { x: event.clientX, y: event.clientY };
    dragScreenDistanceRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    onAimChange(null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const point = aimPointFromEvent(event, camera, gl.domElement, start.y);
    if (!point) return;
    const screenStart = dragStartScreenRef.current;
    const screenDistance = screenStart
      ? Math.hypot(event.clientX - screenStart.x, event.clientY - screenStart.y)
      : 0;
    dragCurrentRef.current = point;
    dragScreenDistanceRef.current = screenDistance;
    onAimChange(buildBallAimDraft(start, point, screenDistance));
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    const current = dragCurrentRef.current;
    if (!start || !current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const draft = buildBallAimDraft(
      start,
      current,
      dragScreenDistanceRef.current,
    );
    clearDrag();
    if (draft) {
      onAimRelease(draft);
    } else {
      onAimChange(null);
    }
  };

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearDrag();
    onAimChange(null);
  };

  return (
    <Html
      position={position}
      center
      style={{ pointerEvents: enabled ? "auto" : "none" }}
    >
      <button
        ref={targetRef}
        type="button"
        data-testid="ball-aim-target"
        data-kick-maximum-power={maximumPower}
        aria-label="Aim from the live ball"
        aria-hidden={!enabled}
        disabled={!enabled}
        className={`h-20 w-20 rounded-full border-0 bg-transparent p-0 outline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-200 ${
          enabled ? "" : "pointer-events-none"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </Html>
  );
}
