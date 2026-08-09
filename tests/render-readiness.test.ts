import { describe, expect, it } from "vitest";

import {
  createRenderReadinessState,
  invalidateRenderReadiness,
  observeRenderFrame,
  REQUIRED_COMPLETE_RENDER_FRAMES,
} from "../src/app/(game)/render-readiness";

function qualify(signature: string) {
  let state = createRenderReadinessState();
  for (let frame = 0; frame < REQUIRED_COMPLETE_RENDER_FRAMES; frame += 1) {
    state = observeRenderFrame(state, { valid: true, signature });
  }
  return state;
}

describe("field render readiness", () => {
  it("invalidates immediately and requires fresh frames after context restore", () => {
    const ready = qualify("1280x720@1:1280x720");
    expect(ready.ready).toBe(true);

    const lost = invalidateRenderReadiness();
    expect(lost).toEqual(createRenderReadinessState());

    const firstRestoredFrame = observeRenderFrame(lost, {
      valid: true,
      signature: "1280x720@1:1280x720",
    });
    expect(firstRestoredFrame.ready).toBe(false);
    expect(firstRestoredFrame.completeFrameCount).toBe(1);
    expect(
      observeRenderFrame(firstRestoredFrame, {
        valid: false,
        signature: "1280x720@1:1280x720",
      }).ready,
    ).toBe(false);
  });

  it("invalidates qualification when viewport, orientation, or DPR changes", () => {
    const portrait = qualify("390x844@3:1170x2532");
    const firstLandscapeFrame = observeRenderFrame(portrait, {
      valid: true,
      signature: "844x390@3:2532x1170",
    });

    expect(firstLandscapeFrame.ready).toBe(false);
    expect(firstLandscapeFrame.completeFrameCount).toBe(1);

    const firstDprFrame = observeRenderFrame(qualify("844x390@2:1688x780"), {
      valid: true,
      signature: "844x390@3:2532x1170",
    });
    expect(firstDprFrame.ready).toBe(false);
    expect(firstDprFrame.completeFrameCount).toBe(1);
  });
});
