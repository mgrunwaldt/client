import { describe, expect, it } from "vitest";

import {
  canvasCoversViewport,
  createRenderReadinessState,
  fieldRenderSceneKey,
  invalidateRenderReadiness,
  observeRenderFrame,
  REQUIRED_COMPLETE_RENDER_FRAMES,
} from "../src/app/(game)/render-readiness";
import {
  hasPresentedFieldForMatch,
  reportFieldPresented,
  resetFieldPresentationReadiness,
} from "../src/match/field-presentation-readiness";

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

  it("accepts small mobile browser inset differences without hanging the field", () => {
    expect(
      canvasCoversViewport(
        { x: 2, y: 4, width: 386, height: 840 },
        { width: 390, height: 844 },
      ),
    ).toBe(true);
    expect(
      canvasCoversViewport(
        { x: 20, y: 0, width: 350, height: 844 },
        { width: 390, height: 844 },
      ),
    ).toBe(false);
  });

  it("invalidates the scene identity when positions or camera framing change", () => {
    const base = {
      actionId: "action-1",
      sceneFamily: "OPEN_PLAY",
      ball: { x: 50, y: 30 },
      myPlayers: [{ id: "legend", x: 50, y: 32 }],
      opponentPlayers: [{ id: "defender", x: 45, y: 20 }],
      view: { left: 0, top: -6, width: 100, height: 50 },
    };
    const key = fieldRenderSceneKey(base);

    expect(
      fieldRenderSceneKey({
        ...base,
        opponentPlayers: [{ id: "defender", x: 46, y: 20 }],
      }),
    ).not.toBe(key);
    expect(
      fieldRenderSceneKey({
        ...base,
        view: { ...base.view, left: 5 },
      }),
    ).not.toBe(key);
  });
});

describe("field presentation lifecycle", () => {
  it("remembers only the match whose field the player has already visited", () => {
    resetFieldPresentationReadiness();

    expect(hasPresentedFieldForMatch("match-a")).toBe(false);
    reportFieldPresented("match-a");
    expect(hasPresentedFieldForMatch("match-a")).toBe(true);
    expect(hasPresentedFieldForMatch("match-b")).toBe(false);

    resetFieldPresentationReadiness();
    expect(hasPresentedFieldForMatch("match-a")).toBe(false);
  });
});
