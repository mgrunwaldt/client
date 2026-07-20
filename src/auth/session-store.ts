import { create } from "zustand";

export type AuthTransportKind = "cookie" | "bearer";
export type AuthStatus =
  | "unknown"
  | "hydrating"
  | "authenticating"
  | "authenticated"
  | "unauthenticated"
  | "account_switching"
  | "error";

export interface AuthSessionSummary {
  issued_at?: string;
  idle_expires_at?: string;
  absolute_expires_at?: string;
  subject?: {
    provider: string;
    chain_id: string;
    account_address: string;
  } | null;
}

interface AuthSessionState {
  status: AuthStatus;
  transport: AuthTransportKind;
  walletAddress: string | null;
  chainId: string | null;
  session: AuthSessionSummary | null;
  csrfToken: string | null;
  bearerCredential: string | null;
  error: string | null;
}

interface AuthSessionActions {
  beginHydration: () => void;
  beginAuthentication: (walletAddress: string, chainId: string) => void;
  setAuthenticated: (payload: {
    walletAddress: string | null;
    chainId: string | null;
    session: AuthSessionSummary;
    transport: AuthTransportKind;
    csrfToken?: string | null;
    bearerCredential?: string | null;
  }) => void;
  setUnauthenticated: () => void;
  beginAccountSwitch: () => void;
  setError: (message: string) => void;
  clear: () => void;
}

export type AuthSessionStore = AuthSessionState & AuthSessionActions;

const initialState: AuthSessionState = {
  status: "unknown",
  transport: "cookie",
  walletAddress: null,
  chainId: null,
  session: null,
  csrfToken: null,
  bearerCredential: null,
  error: null,
};

export const useAuthSessionStore = create<AuthSessionStore>((set) => ({
  ...initialState,
  beginHydration: () => set({ status: "hydrating", error: null }),
  beginAuthentication: (walletAddress, chainId) =>
    set({
      ...initialState,
      status: "authenticating",
      walletAddress,
      chainId,
    }),
  setAuthenticated: ({
    walletAddress,
    chainId,
    session,
    transport,
    csrfToken = null,
    bearerCredential = null,
  }) =>
    set({
      status: "authenticated",
      transport,
      walletAddress,
      chainId,
      session,
      // Cookie CSRF and bearer credentials are intentionally memory-only.
      csrfToken: transport === "cookie" ? csrfToken : null,
      bearerCredential: transport === "bearer" ? bearerCredential : null,
      error: null,
    }),
  setUnauthenticated: () => set({ ...initialState, status: "unauthenticated" }),
  beginAccountSwitch: () =>
    set({ ...initialState, status: "account_switching" }),
  setError: (error) => set({ ...initialState, status: "error", error }),
  clear: () => set(initialState),
}));
