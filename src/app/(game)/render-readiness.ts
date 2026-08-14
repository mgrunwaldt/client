export const REQUIRED_COMPLETE_RENDER_FRAMES = 3;
export const VIEWPORT_COVERAGE_TOLERANCE_PX = 8;

export interface RenderReadinessState {
  signature: string | null;
  completeFrameCount: number;
  ready: boolean;
}

export function createRenderReadinessState(): RenderReadinessState {
  return { signature: null, completeFrameCount: 0, ready: false };
}

export function invalidateRenderReadiness(): RenderReadinessState {
  return createRenderReadinessState();
}

export function observeRenderFrame(
  state: RenderReadinessState,
  observation: { valid: boolean; signature: string },
): RenderReadinessState {
  if (!observation.valid) return invalidateRenderReadiness();

  const completeFrameCount =
    state.signature === observation.signature
      ? state.completeFrameCount + 1
      : 1;

  return {
    signature: observation.signature,
    completeFrameCount,
    ready: completeFrameCount >= REQUIRED_COMPLETE_RENDER_FRAMES,
  };
}

export function canvasCoversViewport(
  bounds: Pick<DOMRect, "x" | "y" | "width" | "height">,
  viewport: { width: number; height: number },
) {
  return (
    Math.abs(bounds.x) <= VIEWPORT_COVERAGE_TOLERANCE_PX &&
    Math.abs(bounds.y) <= VIEWPORT_COVERAGE_TOLERANCE_PX &&
    Math.abs(bounds.width - viewport.width) <= VIEWPORT_COVERAGE_TOLERANCE_PX &&
    Math.abs(bounds.height - viewport.height) <= VIEWPORT_COVERAGE_TOLERANCE_PX
  );
}

export function fieldRenderSceneKey({
  actionId,
  sceneFamily,
  ball,
  myPlayers,
  opponentPlayers,
  view,
  cornerFieldX,
}: {
  actionId: string | null;
  sceneFamily: string | null;
  ball: { x: number; y: number } | null;
  myPlayers: Array<{ id: string; x: number; y: number }>;
  opponentPlayers: Array<{ id: string; x: number; y: number }>;
  view: { left: number; top: number; width: number; height: number };
  cornerFieldX?: number;
}) {
  return [
    actionId ?? "no-action",
    sceneFamily ?? "no-scene",
    ball?.x ?? "no-ball-x",
    ball?.y ?? "no-ball-y",
    ...myPlayers.flatMap((player) => [player.id, player.x, player.y]),
    ...opponentPlayers.flatMap((player) => [player.id, player.x, player.y]),
    view.left,
    view.top,
    view.width,
    view.height,
    cornerFieldX ?? "no-corner",
  ].join(":");
}
