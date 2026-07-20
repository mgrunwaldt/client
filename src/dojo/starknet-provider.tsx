import { mainnet, sepolia } from "@starknet-react/chains";
import {
  jsonRpcProvider,
  StarknetConfig,
  starkscan,
} from "@starknet-react/core";
import type { PropsWithChildren } from "react";

import { createLocalCiConnector } from "../auth/local-ci-connector";
import cartridgeConnector from "../config/cartridgeConnector";

export default function StarknetProvider({ children }: PropsWithChildren) {
  const { VITE_PUBLIC_DEPLOY_TYPE } = import.meta.env;

  // Get RPC URL based on environment
  const getRpcUrl = () => {
    switch (VITE_PUBLIC_DEPLOY_TYPE) {
      case "mainnet":
        return "https://api.cartridge.gg/x/starknet/mainnet";
      case "sepolia":
        return "https://api.cartridge.gg/x/starknet/sepolia";
      default:
        return "https://api.cartridge.gg/x/starknet/sepolia";
    }
  };

  // Create provider with the correct RPC URL
  const provider = jsonRpcProvider({
    rpc: () => ({ nodeUrl: getRpcUrl() }),
  });

  // Determine which chain to use
  const chains = VITE_PUBLIC_DEPLOY_TYPE === "mainnet" ? [mainnet] : [sepolia];
  const localCiConnector = import.meta.env.VITE_E2E_LOCAL_CI_WALLETS
    ? createLocalCiConnector(
        import.meta.env.VITE_E2E_LOCAL_CI_WALLETS,
        getRpcUrl(),
        chains[0].id,
      )
    : null;

  return (
    <StarknetConfig
      autoConnect
      chains={chains}
      connectors={[localCiConnector || cartridgeConnector]}
      explorer={starkscan}
      provider={provider}
    >
      {children}
    </StarknetConfig>
  );
}
