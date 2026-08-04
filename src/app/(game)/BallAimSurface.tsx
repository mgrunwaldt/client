import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { type PointerEvent, useEffect, useRef } from "react";
import * as THREE from "three";

import { type BallAimDraft, buildBallAimDraft } from "../../match/kick-gesture";

const MAX_CONNECTED_FOCUS_ATTEMPTS = 120;
const FOCUS_RESTORE_TIMEOUT_MS = 10_000;
const REQUIRED_STABLE_FOCUS_FRAMES = 2;

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
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
    point,
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

  useEffect(() => {
    if (!enabled || !focusOnMount) return;

    // Html mounts its DOM target through the R3F portal. Native autoFocus can
    // run before that target is attached when the contact dialog closes.
    let frame: number | null = null;
    let timeout = 0;
    let attempts = 0;
    let stableFrames = 0;
    let finished = false;
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(timeout);
      observer?.disconnect();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onFocusRestored?.();
    };
    const scheduleFocus = () => {
      if (finished || frame !== null) return;
      frame = requestAnimationFrame(restoreFocus);
    };
    const restoreFocus = () => {
      frame = null;
      const target = targetRef.current;
      if (!target?.isConnected) {
        stableFrames = 0;
        return;
      }
      attempts += 1;
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
      if (attempts < MAX_CONNECTED_FOCUS_ATTEMPTS) {
        scheduleFocus();
        return;
      }
      finish();
    };

    observer = new MutationObserver(scheduleFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    timeout = window.setTimeout(finish, FOCUS_RESTORE_TIMEOUT_MS);
    scheduleFocus();
    return cleanup;
  }, [enabled, focusOnMount, onFocusRestored]);

  const clearDrag = () => {
    dragStartRef.current = null;
    dragCurrentRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const start = new THREE.Vector3(...position);
    dragStartRef.current = start;
    dragCurrentRef.current = start.clone();
    event.currentTarget.setPointerCapture(event.pointerId);
    onAimChange(null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const point = aimPointFromEvent(event, camera, gl.domElement, start.y);
    if (!point) return;
    dragCurrentRef.current = point;
    onAimChange(buildBallAimDraft(start, point));
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    const current = dragCurrentRef.current;
    if (!start || !current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const draft = buildBallAimDraft(start, current);
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
    <Html position={position} center>
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
