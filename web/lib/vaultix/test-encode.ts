/**
 * Borsh encoders for program accounts, used only by tests to fake what the
 * cluster returns. Mirrors state.rs field order.
 */
import { ORDER_STATUSES, type ConfigAccount, type OrderAccount } from "./contract";
import { CONFIG_DISCRIMINATOR, ORDER_DISCRIMINATOR } from "./decode";

class Writer {
  readonly parts: number[] = [];
  int(n: bigint | number, bytes: 1 | 2 | 8, signed = false) {
    const view = new DataView(new ArrayBuffer(bytes));
    if (bytes === 1) view.setUint8(0, Number(n));
    if (bytes === 2) view.setUint16(0, Number(n), true);
    if (bytes === 8 && signed) view.setBigInt64(0, BigInt(n), true);
    if (bytes === 8 && !signed) view.setBigUint64(0, BigInt(n), true);
    this.parts.push(...new Uint8Array(view.buffer));
  }
  raw(bytes: Uint8Array) {
    this.parts.push(...bytes);
  }
}

export function encodeConfig(c: ConfigAccount): Uint8Array {
  const w = new Writer();
  w.raw(CONFIG_DISCRIMINATOR);
  for (const key of [c.admin, c.arbiter, c.treasury, c.allowedMint]) w.raw(key.toBytes());
  w.int(c.feeBps, 2);
  w.int(c.disputeDepositBps, 2);
  w.int(c.shipDeadlineSecs, 8, true);
  w.int(c.claimWindowSecs, 8, true);
  w.int(c.maxOrderAmount, 8);
  w.int(c.bump, 1);
  return Uint8Array.from(w.parts);
}

/** Padded like InitSpace: room for both options as Some, unused bytes zero. */
export function encodeOrder(o: OrderAccount): Uint8Array {
  const w = new Writer();
  w.raw(ORDER_DISCRIMINATOR);
  w.int(ORDER_STATUSES.indexOf(o.status), 1);
  w.raw(o.seller.toBytes());
  if (o.buyer) {
    w.int(1, 1);
    w.raw(o.buyer.toBytes());
  } else w.int(0, 1);
  w.int(o.orderId, 8);
  w.raw(o.mint.toBytes());
  w.int(o.amount, 8);
  w.int(o.feeBps, 2);
  w.int(o.disputeDepositBps, 2);
  w.int(o.shipDeadlineSecs, 8, true);
  w.int(o.claimWindowSecs, 8, true);
  w.raw(o.listingHash);
  if (o.trackingHash) {
    w.int(1, 1);
    w.raw(o.trackingHash);
  } else w.int(0, 1);
  w.int(o.disputeDeposit, 8);
  w.int(o.createdAt, 8, true);
  w.int(o.paidAt, 8, true);
  w.int(o.shippedAt, 8, true);
  w.raw(o.rentPayer.toBytes());
  w.int(o.bump, 1);
  return Uint8Array.from([...w.parts, ...new Array(64).fill(0)]);
}
