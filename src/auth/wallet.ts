import type { AccountInterface } from "starknet";

import type { WalletAuthSigner } from "./api";

export function walletAuthSigner(
  account: AccountInterface,
  address: string,
  chainId: bigint,
): WalletAuthSigner {
  return {
    accountAddress: address,
    chainId: `0x${chainId.toString(16)}`,
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
