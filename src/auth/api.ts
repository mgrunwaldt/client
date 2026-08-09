import type { TypedData } from "starknet";

import {
  joinMatchApiPath,
  requireMatchApiConfig,
  resolveMatchApiConfig,
  type ValidMatchApiConfig,
} from "./api-config";
import {
  type AuthSessionSummary,
  type AuthTransportKind,
  useAuthSessionStore,
} from "./session-store";

const MATCH_API_CONFIG = resolveMatchApiConfig(
  import.meta.env.VITE_MATCH_API_BASE_URL,
);

export type AuthChallengeAction = "CREATE_SESSION";

export interface WalletAuthSigner {
  accountAddress: string;
  chainId: string;
  signMessage: (typedData: TypedData) => Promise<readonly string[]>;
}

interface AuthChallenge {
  challenge_id: string;
  action: AuthChallengeAction;
  account_address: string;
  chain_id: string;
  expires_at: string;
  typed_data: TypedData;
}

interface AuthSessionResponse {
  session: {
    issued_at: string;
    idle_expires_at: string;
    absolute_expires_at: string;
    subject: {
      provider: "starknet";
      chain_id: string;
      account_address: string;
    };
  };
  legend: { legend_id: string } | null;
  response_context: {
    cookie_csrf_token: string | null;
  };
  session_credential?: string;
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
  config: ValidMatchApiConfig,
  initHeaders?: RequestInit["headers"],
  unsafe = false,
  sessionTransport?: AuthTransportKind,
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
  if (config.transport === "bearer" && sessionTransport === "bearer") {
    headers.set("Overgoal-Session-Transport", "bearer");
  }
  return headers;
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  return response.json();
}

function signatureFromWallet(signature: readonly string[]) {
  if (signature.length < 2 || !signature[0] || !signature[1]) {
    throw new Error("Wallet returned an invalid SNIP-12 signature.");
  }
  return { r: signature[0], s: signature[1] };
}

export function createAuthApiClient(config: ValidMatchApiConfig) {
  async function authRequest<T>(
    path: string,
    init: RequestInit = {},
    options: {
      unsafe?: boolean;
      credentials?: RequestInit["credentials"];
      sessionTransport?: AuthTransportKind;
    } = {},
  ): Promise<T> {
    const unsafe = options.unsafe ?? false;
    const response = await fetch(joinMatchApiPath(config.baseUrl, path), {
      ...init,
      // Direct API origins never receive browser credentials. The backend issues
      // a bearer session only when explicitly requested during session creation.
      credentials:
        config.transport === "bearer"
          ? "omit"
          : (options.credentials ?? "same-origin"),
      headers: requestHeaders(
        config,
        init.headers,
        unsafe,
        options.sessionTransport,
      ),
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

  async function authenticateWalletSession(
    signer: WalletAuthSigner,
  ): Promise<AuthSessionSummary> {
    const store = useAuthSessionStore.getState();
    store.beginAuthentication(signer.accountAddress, signer.chainId);
    try {
      const challenge = await authRequest<AuthChallenge>(
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
        { unsafe: true, credentials: "omit" },
      );
      const signature = signatureFromWallet(
        await signer.signMessage(challenge.typed_data),
      );
      const sessionResult = await authRequest<AuthSessionResponse>(
        "/auth/v1/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge_id: challenge.challenge_id,
            signature,
          }),
        },
        {
          unsafe: true,
          credentials: "same-origin",
          sessionTransport:
            config.transport === "bearer" ? "bearer" : undefined,
        },
      );
      if (config.transport === "bearer" && !sessionResult.session_credential) {
        throw new AuthRequestError(
          "The direct match service did not issue a bearer session.",
          502,
          "BEARER_SESSION_MISSING",
          false,
        );
      }
      useAuthSessionStore.getState().setAuthenticated({
        walletAddress:
          sessionResult.session.subject?.account_address ??
          signer.accountAddress,
        chainId: sessionResult.session.subject?.chain_id ?? signer.chainId,
        session: sessionResult.session,
        transport: config.transport,
        csrfToken:
          config.transport === "cookie"
            ? sessionResult.response_context.cookie_csrf_token
            : null,
        bearerCredential:
          config.transport === "bearer"
            ? (sessionResult.session_credential ?? null)
            : null,
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

  async function hydrateAuthSession(): Promise<AuthSessionSummary> {
    const current = useAuthSessionStore.getState();
    if (config.transport === "bearer" && !current.bearerCredential) {
      const error = new AuthRequestError(
        "Direct API sessions are memory-only. Sign in again to continue.",
        401,
        "BEARER_SESSION_NOT_AVAILABLE",
        false,
      );
      useAuthSessionStore.getState().setUnauthenticated();
      throw error;
    }

    useAuthSessionStore.getState().beginHydration();
    try {
      const result = await authRequest<AuthSessionResponse>(
        "/auth/v1/session",
        { method: "GET" },
      );
      const authenticated = useAuthSessionStore.getState();
      const transport: AuthTransportKind =
        config.transport === "bearer" ? "bearer" : authenticated.transport;
      useAuthSessionStore.getState().setAuthenticated({
        walletAddress:
          result.session.subject?.account_address ??
          authenticated.walletAddress,
        chainId: result.session.subject?.chain_id ?? authenticated.chainId,
        session: result.session,
        transport,
        csrfToken:
          transport === "cookie"
            ? result.response_context.cookie_csrf_token
            : null,
        bearerCredential:
          transport === "bearer" ? authenticated.bearerCredential : null,
      });
      return result.session;
    } catch (error) {
      if (error instanceof AuthRequestError && error.status === 401) {
        useAuthSessionStore.getState().setUnauthenticated();
      } else {
        useAuthSessionStore
          .getState()
          .setError(
            error instanceof Error
              ? error.message
              : "Session hydration failed.",
          );
      }
      throw error;
    }
  }

  async function logoutAuthSession(): Promise<void> {
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

  return { authenticateWalletSession, hydrateAuthSession, logoutAuthSession };
}

function configuredAuthApiClient() {
  return createAuthApiClient(requireMatchApiConfig(MATCH_API_CONFIG));
}

export function authenticateWalletSession(signer: WalletAuthSigner) {
  return configuredAuthApiClient().authenticateWalletSession(signer);
}

export function hydrateAuthSession() {
  return configuredAuthApiClient().hydrateAuthSession();
}

export function logoutAuthSession() {
  return configuredAuthApiClient().logoutAuthSession();
}

export function createAuthenticatedRequestInit(
  config: ValidMatchApiConfig,
  init: RequestInit = {},
  unsafe = false,
): RequestInit {
  return {
    ...init,
    credentials: config.transport === "cookie" ? "same-origin" : "omit",
    headers: requestHeaders(config, init.headers, unsafe),
  };
}

export function authenticatedRequestInit(
  init: RequestInit = {},
  unsafe = false,
): RequestInit {
  return createAuthenticatedRequestInit(
    requireMatchApiConfig(MATCH_API_CONFIG),
    init,
    unsafe,
  );
}

export function matchApiBaseUrl() {
  return requireMatchApiConfig(MATCH_API_CONFIG).baseUrl;
}

export function matchApiConfigurationDiagnostic() {
  return MATCH_API_CONFIG.valid ? null : MATCH_API_CONFIG.diagnostic;
}
