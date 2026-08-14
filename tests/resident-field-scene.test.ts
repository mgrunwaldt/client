import { describe, expect, it } from "vitest";

import { shouldAdoptResidentFieldScene } from "../src/match/resident-field-scene";

describe("resident field scene adoption", () => {
  it("freezes scene entities while the timeline advances or waits on the API", () => {
    expect(shouldAdoptResidentFieldScene("timeline_playback")).toBe(false);
    expect(shouldAdoptResidentFieldScene("resuming")).toBe(false);
  });

  it("adopts authoritative entities only when field presentation begins", () => {
    expect(shouldAdoptResidentFieldScene("scene_ready")).toBe(true);
    expect(shouldAdoptResidentFieldScene("submitting")).toBe(true);
    expect(shouldAdoptResidentFieldScene("result_playback")).toBe(true);
  });
});
