import type { BackendPendingAction } from "./api-v1/contract";

export const RESULT_HOLD_MS = 2_500;
export const E2E_DEBUG_RESULT_CONTINUATION_KEY =
  "overgoal:e2e:debug-result-continuation";

export function isDebugResultContinuationEnabled() {
  if (
    import.meta.env.VITE_E2E_MATCH_SESSION_BRIDGE !== "true" ||
    typeof window === "undefined"
  ) {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(E2E_DEBUG_RESULT_CONTINUATION_KEY) ===
      "true"
    );
  } catch {
    return false;
  }
}

export function shouldContinueResultDirectlyToField({
  pendingAction,
  responseMinute,
}: {
  pendingAction: Pick<BackendPendingAction, "minute" | "source"> | null;
  responseMinute: number;
}) {
  return (
    pendingAction?.source === "FOLLOW_UP" &&
    pendingAction.minute <= responseMinute
  );
}
