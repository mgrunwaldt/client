import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { type PointerEvent, useRef } from "react";
import * as THREE from "three";

import { type BallAimDraft, buildBallAimDraft } from "../../match/kick-gesture";

interface BallAimSurfaceProps {
  position: [number, number, number];
  maximumPower: number;
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
  onAimChange,
  onAimRelease,
}: BallAimSurfaceProps) {
  const { camera, gl } = useThree();
  const dragStartRef = useRef<THREE.Vector3 | null>(null);
  const dragCurrentRef = useRef<THREE.Vector3 | null>(null);

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
        type="button"
        data-testid="ball-aim-target"
        data-kick-maximum-power={maximumPower}
        aria-label="Aim from the live ball"
        className="h-20 w-20 rounded-full border-0 bg-transparent p-0 outline-offset-4 focus-visible:outline-2 focus-visible:outline-cyan-200"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </Html>
  );
}
