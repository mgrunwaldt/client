import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private values = new Map<string, string>();

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();

describe("mobile game feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("navigator", {});
  });

  it("persists clamped sound and haptic preferences", async () => {
    const feedback = await import("../src/platform/game-feedback");
    feedback.setGameFeedbackPreferences({
      haptics: false,
      muted: true,
      volume: 4,
    });

    expect(feedback.getGameFeedbackPreferences()).toEqual({
      haptics: false,
      muted: true,
      volume: 1,
    });
    expect(
      JSON.parse(localStorage.getItem("overgoal.game-feedback.v1")!),
    ).toEqual(feedback.getGameFeedbackPreferences());
  });

  it("maps authoritative positive outcomes to success feedback", async () => {
    const { outcomeFeedbackCue } = await import(
      "../src/platform/game-feedback"
    );
    expect(outcomeFeedbackCue("GOAL")).toBe("success");
    expect(outcomeFeedbackCue("SUCCESSFUL_PASS")).toBe("success");
    expect(outcomeFeedbackCue("DRIBBLE_SURVIVAL")).toBe("success");
    expect(outcomeFeedbackCue("KICK_TO_OPEN_PLAY")).toBe("success");
    expect(outcomeFeedbackCue("BALL_LOST")).toBe("failure");
  });

  it("vibrates only when haptics are enabled", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const feedback = await import("../src/platform/game-feedback");
    feedback.setGameFeedbackPreferences({ haptics: true, muted: true });
    feedback.playGameFeedback("action");
    expect(vibrate).toHaveBeenCalledOnce();

    feedback.setGameFeedbackPreferences({ haptics: false });
    feedback.playGameFeedback("action");
    expect(vibrate).toHaveBeenCalledOnce();
  });
});
