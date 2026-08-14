import { describe, expect, it } from "vitest";

import { shouldContinueResultDirectlyToField } from "../src/match/result-continuation";

describe("result continuation routing", () => {
  it("returns possession chains through Timeline", () => {
    expect(
      shouldContinueResultDirectlyToField({
        pendingAction: { minute: 13, source: "POSSESSION_CHAIN" },
        responseMinute: 13,
      }),
    ).toBe(false);
  });

  it("keeps an immediate follow-up on the field", () => {
    expect(
      shouldContinueResultDirectlyToField({
        pendingAction: { minute: 13, source: "FOLLOW_UP" },
        responseMinute: 13,
      }),
    ).toBe(true);
  });

  it("does not skip Timeline for absent or future actions", () => {
    expect(
      shouldContinueResultDirectlyToField({
        pendingAction: null,
        responseMinute: 13,
      }),
    ).toBe(false);
    expect(
      shouldContinueResultDirectlyToField({
        pendingAction: { minute: 14, source: "FOLLOW_UP" },
        responseMinute: 13,
      }),
    ).toBe(false);
  });
});
