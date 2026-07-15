import { useAccount } from "@starknet-react/core";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useCreatePlayer } from "../../dojo/hooks/useCreatePlayer";
import { useStarknetConnect } from "../../dojo/hooks/useStarknetConnect";
import { Button } from "../ui/button";

interface LoginButtonProps {
  className?: string;
  onLoginSuccess?: () => void;
  onLoginError?: (error: Error) => void;
  autoInitializePlayer?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  children?: React.ReactNode;
}

function LoginButton({
  className = "",
  onLoginError,
  autoInitializePlayer = true,
  variant = "default",
  size = "default",
  children,
}: LoginButtonProps) {
  const { status, isConnecting, handleConnect } = useStarknetConnect();
  const { account } = useAccount();
  const { initializePlayer, isInitializing, txStatus } = useCreatePlayer();
  const navigate = useNavigate();
  // Use ref to track initialization attempt to prevent infinite loops
  const hasAttemptedInit = useRef(false);

  const isConnected = status === "connected";
  const hasAccount = !!account;
  const isLoading = isConnecting || status === "connecting" || isInitializing;

  // Reset initialization flag when playerId changes or connection is lost
  useEffect(() => {
    if (!isConnected) {
      hasAttemptedInit.current = false;
    }
  }, [isConnected]);

  // 🎮 Auto-initialize player after connecting controller
  useEffect(() => {
    if (
      isConnected &&
      hasAccount &&
      !isInitializing &&
      autoInitializePlayer &&
      !hasAttemptedInit.current // Only run if we haven't attempted yet
    ) {
      console.log(
        "🎮 Controller connected and account available, auto-initializing...",
      );

      hasAttemptedInit.current = true; // Mark as attempted

      const timeoutId = setTimeout(async () => {
        try {
          const result = await initializePlayer();
          console.log("🎮 Auto-initialization result:", result);

          if (result.success) {
            navigate("/season-countdown");
          } else {
            // Reset flag on failure so user can try again
            hasAttemptedInit.current = false;
            onLoginError?.(new Error(result.error || "Initialization failed"));
          }
        } catch (error) {
          // Reset flag on error so user can try again
          hasAttemptedInit.current = false;
          console.error("❌ Auto-initialization error:", error);
          onLoginError?.(
            error instanceof Error ? error : new Error("Unknown error"),
          );
        }
      }, 500);

      // Cleanup timeout if component unmounts or effect re-runs
      return () => clearTimeout(timeoutId);
    }
  }, [
    autoInitializePlayer,
    hasAccount,
    initializePlayer,
    isConnected,
    isInitializing,
    navigate,
    onLoginError,
  ]);

  // Show different button states based on current status
  const getButtonContent = () => {
    if (isConnecting)
      return <span className="airstrike-normal text-5xl">Connecting...</span>;
    if (isConnected && !hasAccount) return;
    if (isInitializing)
      return <span className="airstrike-normal text-5xl">Claiming..</span>;
    if (txStatus === "SUCCESS") return "Claimed!";
    return children || "Claim";
  };

  // Log current state for debugging
  console.log("🎮 LoginButton State:", {
    status,
    isConnected,
    hasAccount,
    isInitializing,
    autoInitializePlayer,
  });

  return (
    <Button
      onClick={handleConnect}
      disabled={isLoading || (isConnected && !hasAccount)}
      variant={variant}
      size={size}
      className={className}
    >
      {getButtonContent()}
    </Button>
  );
}

LoginButton.displayName = "LoginButton";
export default LoginButton;
