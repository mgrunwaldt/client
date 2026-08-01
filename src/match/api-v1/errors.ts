export interface MatchApiResponseMetadata {
  apiVersion: string | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
}

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
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
