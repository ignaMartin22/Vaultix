import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { ORDER_STATUSES, type OrderAccount } from "./contract";
import { decodeOrderAccount, ORDER_DISCRIMINATOR } from "./decode";

/** Borsh-encodes an Order the way the program does, padded like InitSpace. */
function encodeOrder(o: OrderAccount): Uint8Array {
  const parts: number[] = [...ORDER_DISCRIMINATOR];
  const u = (n: bigint, bytes: number, signed = false) => {
    const buf = new DataView(new ArrayBuffer(bytes));
    if (bytes === 1) buf.setUint8(0, Number(n));
    if (bytes === 2) buf.setUint16(0, Number(n), true);
    if (bytes === 8 && signed) buf.setBigInt64(0, n, true);
    if (bytes === 8 && !signed) buf.setBigUint64(0, n, true);
    parts.push(...new Uint8Array(buf.buffer));
  };
  const raw = (b: Uint8Array) => parts.push(...b);
  u(BigInt(ORDER_STATUSES.indexOf(o.status)), 1);
  raw(o.seller.toBytes());
  if (o.buyer) {
    u(1n, 1);
    raw(o.buyer.toBytes());
  } else u(0n, 1);
  u(o.orderId, 8);
  raw(o.mint.toBytes());
  u(o.amount, 8);
  u(BigInt(o.feeBps), 2);
  u(BigInt(o.disputeDepositBps), 2);
  u(o.shipDeadlineSecs, 8, true);
  u(o.claimWindowSecs, 8, true);
  raw(o.listingHash);
  if (o.trackingHash) {
    u(1n, 1);
    raw(o.trackingHash);
  } else u(0n, 1);
  u(o.disputeDeposit, 8);
  u(o.createdAt, 8, true);
  u(o.paidAt, 8, true);
  u(o.shippedAt, 8, true);
  raw(o.rentPayer.toBytes());
  u(BigInt(o.bump), 1);
  // InitSpace reserves room for both options as Some: unused bytes stay zero.
  return Uint8Array.from([...parts, ...new Array(64).fill(0)]);
}

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

  it("rejects other accounts and truncated data", () => {
    const data = encodeOrder(base);
    const wrong = data.slice();
    wrong[0] ^= 0xff;
    expect(() => decodeOrderAccount(wrong)).toThrow(/Not an Order/);
    expect(() => decodeOrderAccount(data.slice(0, 40))).toThrow(/truncated/);
  });
});
