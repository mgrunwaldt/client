import { useAccount } from "@starknet-react/core";
import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router";

import {
  authenticateWalletSession,
  hydrateAuthSession,
  logoutAuthSession,
} from "../../auth/api";
import { useAuthSessionStore } from "../../auth/session-store";
import { walletAuthSigner } from "../../auth/wallet";
import { useStarknetConnect } from "../../dojo/hooks/useStarknetConnect";
import { useMatchSessionStore } from "../../match/session-store";
import LoadingScreen from "../loader/LoadingScreen";

export function AuthenticatedLayout() {
  const { status } = useStarknetConnect();
  const { account, address, chainId } = useAccount();
  const navigate = useNavigate();
  const authStatus = useAuthSessionStore((state) => state.status);
  const authenticatedWallet = useAuthSessionStore(
    (state) => state.walletAddress,
  );
  const resetMatchSession = useMatchSessionStore(
    (state) => state.resetMatchSession,
  );
  const bootstrapRef = useRef(false);
  const switchingRef = useRef(false);

  useEffect(() => {
    if (status === "disconnected" || authStatus === "unauthenticated") {
      resetMatchSession();
      navigate("/login");
    }
  }, [authStatus, navigate, resetMatchSession, status]);

  useEffect(() => {
    if (status !== "connected" || !account || !address || !chainId) return;
    if (authenticatedWallet && authenticatedWallet !== address) {
      if (switchingRef.current) return;
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
          await hydrateAuthSession();
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
    authStatus === "unknown" ||
    authStatus === "hydrating" ||
    authStatus === "account_switching"
  ) {
    return <LoadingScreen isLoading={true} progress={50} />;
  }

  // Only render children if connected
  if (status === "connected" && authStatus === "authenticated") {
    return <Outlet />;
  }

  // Return null while redirecting
  return null;
}
