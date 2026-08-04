import { describe, expect, it } from "vitest";

import { BackendRequestError } from "../src/match/api-v1/errors";
import {
  beginHydration,
  createReconnectHydrationGate,
  isRetryableHydrationFailure,
  requestReconnectHydration,
  settleHydration,
} from "../src/match/reconnect-hydration";

describe("reconnect hydration gate", () => {
  it("deduplicates online events while hydration is in flight", () => {
    const gate = createReconnectHydrationGate();
    beginHydration(gate);

    expect(requestReconnectHydration(gate)).toBe(false);
    expect(requestReconnectHydration(gate)).toBe(false);
    expect(settleHydration(gate, true)).toBe(false);
    expect(gate).toEqual({ inFlight: false, reconnectQueued: false });
  });

  it("retries one queued reconnect when the active hydration fails", () => {
    const gate = createReconnectHydrationGate();
    beginHydration(gate);
    expect(requestReconnectHydration(gate)).toBe(false);

    expect(settleHydration(gate, false)).toBe(true);
    expect(gate).toEqual({ inFlight: true, reconnectQueued: false });
  });

  it("discards a queued reconnect when the active hydration fails terminally", () => {
    const gate = createReconnectHydrationGate();
    beginHydration(gate);
    expect(requestReconnectHydration(gate)).toBe(false);

    expect(settleHydration(gate, false, false)).toBe(false);
    expect(gate).toEqual({ inFlight: false, reconnectQueued: false });
  });

  it("uses the backend retryability contract for hydration failures", () => {
    const metadata = {
      apiVersion: "v1",
      requestId: "request-1",
      retryAfterSeconds: null,
    };

    expect(
      isRetryableHydrationFailure(
        new BackendRequestError(
          "Not found",
          404,
          "MATCH_NOT_FOUND",
          false,
          "STOP",
          metadata,
        ),
      ),
    ).toBe(false);
    expect(isRetryableHydrationFailure(new TypeError("offline"))).toBe(true);
  });

  it("starts a reconnect hydration immediately when idle", () => {
    const gate = createReconnectHydrationGate();

    expect(requestReconnectHydration(gate)).toBe(true);
    expect(gate).toEqual({ inFlight: true, reconnectQueued: false });
  });
});
