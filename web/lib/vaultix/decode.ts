/**
 * Borsh decoder for the `Order` account (state.rs / IDL field order), so the
 * server can read orders with plain `getAccountInfo` and no Anchor runtime.
 */
import { PublicKey } from "@solana/web3.js";

import idl from "./idl.json";
import { ORDER_STATUSES, type OrderAccount } from "./contract";

export const ORDER_DISCRIMINATOR = Uint8Array.from(
  idl.accounts.find((a) => a.name === "Order")!.discriminator,
);

class Reader {
  private offset = 0;
  constructor(private readonly view: DataView, private readonly bytes: Uint8Array) {}

  u8(): number {
    return this.view.getUint8(this.take(1));
  }
  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }
  u64(): bigint {
    return this.view.getBigUint64(this.take(8), true);
  }
  i64(): bigint {
    return this.view.getBigInt64(this.take(8), true);
  }
  bytes32(): Uint8Array {
    const at = this.take(32);
    return this.bytes.slice(at, at + 32);
  }
  pubkey(): PublicKey {
    return new PublicKey(this.bytes32());
  }
  option<T>(read: () => T): T | null {
    const tag = this.u8();
    if (tag === 0) return null;
    if (tag === 1) return read();
    throw new Error(`Invalid Option tag ${tag}`);
  }
  private take(n: number): number {
    const at = this.offset;
    if (at + n > this.bytes.length) throw new Error("Order account data is truncated");
    this.offset += n;
    return at;
  }
}

/** Decodes raw account data (discriminator included). Throws if it isn't an `Order`. */
export function decodeOrderAccount(data: Uint8Array): OrderAccount {
  if (data.length < 8 || !ORDER_DISCRIMINATOR.every((b, i) => data[i] === b)) {
    throw new Error("Not an Order account");
  }
  const r = new Reader(new DataView(data.buffer, data.byteOffset, data.byteLength), data);
  // Skip the discriminator; fields are read in declaration order below.
  for (let i = 0; i < 8; i++) r.u8();

  const statusIndex = r.u8();
  const status = ORDER_STATUSES[statusIndex];
  if (!status) throw new Error(`Unknown order status ${statusIndex}`);

  return {
    status,
    seller: r.pubkey(),
    buyer: r.option(() => r.pubkey()),
    orderId: r.u64(),
    mint: r.pubkey(),
    amount: r.u64(),
    feeBps: r.u16(),
    disputeDepositBps: r.u16(),
    shipDeadlineSecs: r.i64(),
    claimWindowSecs: r.i64(),
    listingHash: r.bytes32(),
    trackingHash: r.option(() => r.bytes32()),
    disputeDeposit: r.u64(),
    createdAt: r.i64(),
    paidAt: r.i64(),
    shippedAt: r.i64(),
    rentPayer: r.pubkey(),
    bump: r.u8(),
  };
}
