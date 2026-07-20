import type { TypedData } from "starknet";

import {
  type AuthSessionSummary,
  type AuthTransportKind,
  useAuthSessionStore,
} from "./session-store";

const API_BASE_URL = import.meta.env.VITE_MATCH_API_BASE_URL || "/api";

export type AuthChallengeAction = "CREATE_SESSION";

export interface WalletAuthSigner {
  accountAddress: string;
  chainId: string;
  signMessage: (typedData: TypedData) => Promise<readonly string[]>;
}

interface AuthChallenge {
  challenge_id: string;
  typed_data: TypedData;
}

interface AuthSessionResponse {
  session: AuthSessionSummary;
  transport?: {
    kind?: AuthTransportKind;
    bearer_credential?: string;
  };
}

interface AuthHydrationResponse {
  session: AuthSessionSummary;
  response_context: {
    cookie_csrf_token: string | null;
  };
}

interface AuthErrorBody {
  error?: string;
  code?: string;
  retryable?: boolean;
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function requestHeaders(
  initHeaders?: RequestInit["headers"],
  unsafe = false,
): Headers {
  const headers = new Headers(initHeaders);
  headers.set("Accept", "application/json");

  const auth = useAuthSessionStore.getState();
  if (auth.transport === "bearer" && auth.bearerCredential) {
    headers.set("Authorization", `Bearer ${auth.bearerCredential}`);
  }
  if (unsafe && auth.transport === "cookie" && auth.csrfToken) {
    headers.set("X-CSRF-Token", auth.csrfToken);
  }
  return headers;
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  return response.json();
}

async function authRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { unsafe?: boolean; includeSession?: boolean } = {},
): Promise<T> {
  const unsafe = options.unsafe ?? false;
  const includeSession = options.includeSession ?? true;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: includeSession ? "include" : "omit",
    headers: requestHeaders(init.headers, unsafe),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    const error = (data ?? {}) as AuthErrorBody;
    throw new AuthRequestError(
      error.error || `Authentication request failed: ${path}`,
      response.status,
      error.code || null,
      error.retryable === true,
    );
  }
  return data as T;
}

function signatureFromWallet(signature: readonly string[]) {
  if (signature.length < 2 || !signature[0] || !signature[1]) {
    throw new Error("Wallet returned an invalid SNIP-12 signature.");
  }
  return { r: signature[0], s: signature[1] };
}

export async function authenticateWalletSession(
  signer: WalletAuthSigner,
): Promise<AuthSessionSummary> {
  const store = useAuthSessionStore.getState();
  store.beginAuthentication(signer.accountAddress, signer.chainId);
  try {
    const challengeResult = await authRequest<{ challenge: AuthChallenge }>(
      "/auth/v1/challenges",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_SESSION" satisfies AuthChallengeAction,
          chain_id: signer.chainId,
          account_address: signer.accountAddress,
        }),
      },
      { unsafe: true, includeSession: false },
    );
    const signature = signatureFromWallet(
      await signer.signMessage(challengeResult.challenge.typed_data),
    );
    const sessionResult = await authRequest<AuthSessionResponse>(
      "/auth/v1/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {
            challenge_id: challengeResult.challenge.challenge_id,
            signature,
          },
        }),
      },
      { unsafe: true, includeSession: false },
    );
    const transport = sessionResult.transport?.kind || "cookie";
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: signer.accountAddress,
      chainId: signer.chainId,
      session: sessionResult.session,
      transport,
      bearerCredential: sessionResult.transport?.bearer_credential || null,
    });
    return sessionResult.session;
  } catch (error) {
    useAuthSessionStore
      .getState()
      .setError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    throw error;
  }
}

export async function hydrateAuthSession(): Promise<AuthSessionSummary> {
  useAuthSessionStore.getState().beginHydration();
  try {
    const result = await authRequest<AuthHydrationResponse>(
      "/auth/v1/session",
      { method: "GET" },
    );
    const current = useAuthSessionStore.getState();
    useAuthSessionStore.getState().setAuthenticated({
      walletAddress: current.walletAddress,
      chainId: current.chainId,
      session: result.session,
      transport: current.transport,
      csrfToken: result.response_context.cookie_csrf_token,
      bearerCredential: current.bearerCredential,
    });
    return result.session;
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) {
      useAuthSessionStore.getState().setUnauthenticated();
    } else {
      useAuthSessionStore
        .getState()
        .setError(
          error instanceof Error ? error.message : "Session hydration failed.",
        );
    }
    throw error;
  }
}

export async function logoutAuthSession(): Promise<void> {
  try {
    // Logout is the contract's idempotent revoke-only CSRF exception.
    await authRequest<void>(
      "/auth/v1/session",
      { method: "DELETE" },
      { unsafe: false },
    );
  } finally {
    useAuthSessionStore.getState().clear();
  }
}

export function authenticatedRequestInit(
  init: RequestInit = {},
  unsafe = false,
): RequestInit {
  const auth = useAuthSessionStore.getState();
  return {
    ...init,
    credentials: auth.transport === "cookie" ? "include" : "omit",
    headers: requestHeaders(init.headers, unsafe),
  };
}

export function matchApiBaseUrl() {
  return API_BASE_URL;
}
