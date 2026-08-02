import { useAccount } from "@starknet-react/core";
import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router";

import {
  authenticateWalletSession,
  hydrateAuthSession,
  logoutAuthSession,
} from "../../auth/api";
import { useAuthSessionStore } from "../../auth/session-store";
import { canonicalWalletAddress, walletAuthSigner } from "../../auth/wallet";
import { useStarknetConnect } from "../../dojo/hooks/useStarknetConnect";
import { useMatchSessionStore } from "../../match/session-store";
import LoadingScreen from "../loader/LoadingScreen";

export function AuthenticatedLayout() {
  const { status } = useStarknetConnect();
  const { account, address, chainId } = useAccount();
  const navigate = useNavigate();
  const authStatus = useAuthSessionStore((state) => state.status);
  const authError = useAuthSessionStore((state) => state.error);
  const authenticatedWallet = useAuthSessionStore(
    (state) => state.walletAddress,
  );
  const resetMatchSession = useMatchSessionStore(
    (state) => state.resetMatchSession,
  );
  const bootstrapRef = useRef(false);
  const switchingRef = useRef(false);

  const retryAuthentication = () => {
    bootstrapRef.current = false;
    switchingRef.current = false;
    useAuthSessionStore.getState().clear();
  };

  useEffect(() => {
    if (status === "disconnected" || authStatus === "unauthenticated") {
      resetMatchSession();
      navigate("/login");
    }
  }, [authStatus, navigate, resetMatchSession, status]);

  useEffect(() => {
    if (status !== "connected" || !account || !address || !chainId) return;
    if (switchingRef.current) return;
    const connectedWallet = canonicalWalletAddress(address);
    if (authenticatedWallet && authenticatedWallet !== connectedWallet) {
      switchingRef.current = true;
      useAuthSessionStore.getState().beginAccountSwitch();
      resetMatchSession();
      void (async () => {
        try {
          await logoutAuthSession();
          await authenticateWalletSession(
            walletAuthSigner(account, address, chainId),
          );
        } finally {
          switchingRef.current = false;
        }
      })();
      return;
    }
    if (authStatus === "unknown") {
      if (bootstrapRef.current) return;
      bootstrapRef.current = true;
      void (async () => {
        try {
          // Hydration recovers only the existing cookie-bound CSRF token.
          const session = await hydrateAuthSession();
          if (
            session.subject?.account_address === canonicalWalletAddress(address)
          ) {
            return;
          }
          await logoutAuthSession();
        } catch {
          // A missing or expired cookie still permits a fresh wallet session.
        }
        await authenticateWalletSession(
          walletAuthSigner(account, address, chainId),
        );
      })()
        .catch(() => undefined)
        .finally(() => {
          bootstrapRef.current = false;
        });
    }
  }, [
    account,
    address,
    authStatus,
    authenticatedWallet,
    chainId,
    resetMatchSession,
    status,
  ]);

  // Show loading while checking connection
  if (
    status === "connecting" ||
    status === "reconnecting" ||
    authStatus === "unknown" ||
    authStatus === "hydrating" ||
    authStatus === "authenticating" ||
    authStatus === "account_switching"
  ) {
    const switchingAccount = authStatus === "account_switching";
    return (
      <LoadingScreen
        isLoading={true}
        progress={switchingAccount ? 65 : 45}
        title={switchingAccount ? "Switching player" : "Signing in"}
        detail={
          switchingAccount
            ? "Securing the new wallet session"
            : "Verifying your Overgoal session"
        }
        label="Authenticating player"
      />
    );
  }

  // Only render children if connected
  if (status === "connected" && authStatus === "authenticated") {
    return <Outlet />;
  }

  if (status === "connected" && authStatus === "error") {
    return (
      <main className="fixed inset-0 z-[190] flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(234,36,112,0.16),transparent_34%),linear-gradient(180deg,#061124,#020816)] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-[2rem] border border-pink-400/45 bg-slate-950/84 px-7 py-8 text-center shadow-[0_0_48px_rgba(234,36,112,0.12)]"
        >
          <p className="font-orbitron text-xs font-bold tracking-[0.35em] text-pink-300 uppercase">
            Session interrupted
          </p>
          <h1 className="airstrike-normal mt-4 text-4xl uppercase">
            Reconnect player
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {authError ?? "Your wallet session could not be verified."}
          </p>
          <button
            type="button"
            onClick={retryAuthentication}
            className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 px-5 py-3 text-sm font-bold tracking-[0.18em] text-cyan-100 uppercase"
          >
            Retry session
          </button>
        </section>
      </main>
    );
  }

  return (
    <LoadingScreen
      isLoading={true}
      progress={20}
      title="Returning to login"
      detail="Your match state is safe"
      label="Redirecting to login"
    />
  );
}
