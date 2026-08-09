export const REQUIRED_COMPLETE_RENDER_FRAMES = 3;

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
