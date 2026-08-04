import { BackendRequestError } from "./api-v1/errors";

export interface ReconnectHydrationGate {
  inFlight: boolean;
  reconnectQueued: boolean;
}

export function createReconnectHydrationGate(): ReconnectHydrationGate {
  return { inFlight: false, reconnectQueued: false };
}

export function beginHydration(gate: ReconnectHydrationGate) {
  gate.inFlight = true;
}

export function requestReconnectHydration(gate: ReconnectHydrationGate) {
  if (gate.inFlight) {
    gate.reconnectQueued = true;
    return false;
  }
  gate.inFlight = true;
  return true;
}

export function settleHydration(
  gate: ReconnectHydrationGate,
  succeeded: boolean,
  retryableFailure = true,
) {
  gate.inFlight = false;
  const retryQueuedReconnect =
    gate.reconnectQueued && !succeeded && retryableFailure;
  gate.reconnectQueued = false;
  if (retryQueuedReconnect) gate.inFlight = true;
  return retryQueuedReconnect;
}

export function isRetryableHydrationFailure(error: unknown) {
  return !(error instanceof BackendRequestError) || error.retryable;
}
