// hooks/useStarknetConnect.ts
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useCallback, useState } from "react";

export function useStarknetConnect() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { status, address } = useAccount();
  const [hasTriedConnect, setHasTriedConnect] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    const connector = connectors[0]; // Cartridge connector
    if (!connector) {
      console.error("No connector found");
      return;
    }

    try {
      setIsConnecting(true);
      setHasTriedConnect(true);
      console.log("🔗 Attempting to connect controller...");
      await connect({ connector });
      console.log("✅ controller connected successfully");
    } catch (error) {
      console.error("❌ Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [connect, connectors]);

  const handleDisconnect = useCallback(async () => {
    try {
      console.log("🔌 Disconnecting controller...");
      await disconnect();
      setHasTriedConnect(false);
      console.log("✅ controller disconnected successfully");
    } catch (error) {
      console.error("❌ Disconnection failed:", error);
    }
  }, [disconnect]);

  console.log("🎮 Starknet Connect Status:", {
    status,
    address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
    isConnecting,
    hasTriedConnect,
    availableConnectors: connectors.length,
  });

  return {
    status,
    address,
    isConnecting,
    hasTriedConnect,
    handleConnect,
    handleDisconnect,
    setHasTriedConnect,
  };
}
