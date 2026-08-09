import { describe, expect, it } from "vitest";

import {
  authenticatedSubjectChanged,
  canonicalWalletAddress,
  canonicalWalletChainId,
} from "../src/auth/wallet";

describe("wallet authentication identity", () => {
  it("canonicalizes wallet and chain identifiers", () => {
    expect(canonicalWalletAddress("0x000ABC")).toBe("0xabc");
    expect(canonicalWalletChainId(0x534en)).toBe("0x534e");
  });

  it("treats either an account or chain change as a new subject", () => {
    expect(authenticatedSubjectChanged("0xabc", "0x1", "0xabc", "0x1")).toBe(
      false,
    );
    expect(authenticatedSubjectChanged("0xabc", "0x1", "0xdef", "0x1")).toBe(
      true,
    );
    expect(authenticatedSubjectChanged("0xabc", "0x1", "0xabc", "0x2")).toBe(
      true,
    );
  });
});
