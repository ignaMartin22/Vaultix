import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import type { OrderAccount } from "./contract";
import { decodeConfigAccount, decodeOrderAccount } from "./decode";
import { encodeConfig, encodeOrder } from "./test-encode";

const base: OrderAccount = {
  status: "Shipped",
  seller: Keypair.generate().publicKey,
  buyer: Keypair.generate().publicKey,
  orderId: 9_007_199_254_740_991n,
  mint: Keypair.generate().publicKey,
  amount: 45_000_000n,
  feeBps: 150,
  disputeDepositBps: 500,
  shipDeadlineSecs: 432_000n,
  claimWindowSecs: 864_000n,
  listingHash: new Uint8Array(32).fill(7),
  trackingHash: new Uint8Array(32).fill(9),
  disputeDeposit: 0n,
  createdAt: 1_750_000_000n,
  paidAt: 1_750_000_100n,
  shippedAt: 1_750_000_200n,
  rentPayer: Keypair.generate().publicKey,
  bump: 254,
};

describe("decodeOrderAccount", () => {
  it("round-trips an order with both options set", () => {
    expect(decodeOrderAccount(encodeOrder(base))).toEqual(base);
  });

  it("handles None options (an unpaid, unshipped order)", () => {
    const created = { ...base, status: "Created" as const, buyer: null, trackingHash: null, paidAt: 0n, shippedAt: 0n };
    expect(decodeOrderAccount(encodeOrder(created))).toEqual(created);
  });

  it("decodes the config", () => {
    const config = {
      admin: Keypair.generate().publicKey,
      arbiter: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
      allowedMint: Keypair.generate().publicKey,
      feeBps: 150,
      disputeDepositBps: 500,
      shipDeadlineSecs: 432_000n,
      claimWindowSecs: 864_000n,
      maxOrderAmount: 500_000_000n,
      bump: 253,
    };
    expect(decodeConfigAccount(encodeConfig(config))).toEqual(config);
    expect(() => decodeConfigAccount(encodeOrder(base))).toThrow(/Not a Vaultix Config/);
  });

  it("rejects other accounts and truncated data", () => {
    const data = encodeOrder(base);
    const wrong = data.slice();
    wrong[0] ^= 0xff;
    expect(() => decodeOrderAccount(wrong)).toThrow(/Not a Vaultix Order/);
    expect(() => decodeOrderAccount(data.slice(0, 40))).toThrow(/truncated/);
  });
});
