import type { AccountInterface } from "starknet";

import type { WalletAuthSigner } from "./api";

export function canonicalWalletAddress(address: string) {
  return `0x${BigInt(address).toString(16)}`;
}

export function canonicalWalletChainId(chainId: bigint) {
  return `0x${chainId.toString(16)}`;
}

export function authenticatedSubjectChanged(
  authenticatedWallet: string | null,
  authenticatedChain: string | null,
  connectedWallet: string,
  connectedChain: string,
) {
  return Boolean(
    authenticatedWallet &&
      (authenticatedWallet !== connectedWallet ||
        (authenticatedChain !== null && authenticatedChain !== connectedChain)),
  );
}

export function walletAuthSigner(
  account: AccountInterface,
  address: string,
  chainId: bigint,
): WalletAuthSigner {
  return {
    accountAddress: canonicalWalletAddress(address),
    chainId: canonicalWalletChainId(chainId),
    signMessage: async (typedData) => {
      const signature = await account.signMessage(typedData);
      if (Array.isArray(signature)) {
        return signature.map((part) => String(part));
      }
      const starkSignature = signature as {
        r: string | bigint;
        s: string | bigint;
      };
      return [String(starkSignature.r), String(starkSignature.s)];
    },
  };
}
