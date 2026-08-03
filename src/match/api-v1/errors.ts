export interface MatchApiResponseMetadata {
  apiVersion: string | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
}

export const MATCH_RECOVERY_ACTIONS = [
  "REAUTHENTICATE",
  "CHECK_TRANSPORT",
  "HYDRATE_MATCH",
  "USE_RECOVERY_INTENT",
  "FIX_REQUEST",
  "RETRY_SAME_REQUEST",
  "STOP",
] as const;

export type MatchRecoveryAction = (typeof MATCH_RECOVERY_ACTIONS)[number];

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly recoveryAction: MatchRecoveryAction | null,
    readonly metadata: MatchApiResponseMetadata,
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

export class MatchApiContractError extends Error {
  constructor(
    message: string,
    readonly metadata: MatchApiResponseMetadata,
    readonly causeSummary: string | null = null,
  ) {
    super(message);
    this.name = "MatchApiContractError";
  }
}
