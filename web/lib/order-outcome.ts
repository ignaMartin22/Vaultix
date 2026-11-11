/**
 * How a finished order ended, rebuilt from its indexed events. The daily crank
 * closes final orders to recover their rent, so after that the account is gone
 * and the link would have nothing to show. The events stay in `order_events`.
 */
import type { OrderStatus } from "./vaultix/contract";

export type FinalStatus = Extract<OrderStatus, "Released" | "Refunded" | "Resolved">;

/** One row of `order_events`, as the outcome route reads it. */
export interface HistoryEvent {
  type: string;
  /** snake_case keys; u64 as strings, pubkeys base58, hashes hex. */
  payload: Record<string, unknown>;
  slot: number;
  index: number;
}

export interface ClosedOutcome {
  status: FinalStatus;
  seller: string;
  buyer: string | null;
  amount: bigint;
  /** Hex, to check against the listing like the live order's hash. */
  listingHash: string;
  sellerAmount: bigint;
  buyerAmount: bigint;
  fee: bigint;
}

/** The outcome as JSON (bigints as strings), for the API. */
export type ClosedOutcomeJson = Omit<ClosedOutcome, "amount" | "sellerAmount" | "buyerAmount" | "fee"> & {
  amount: string;
  sellerAmount: string;
  buyerAmount: string;
  fee: string;
};

const units = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};

/**
 * `null` unless the latest life of the order (after its last `OrderCreated`)
 * reached a final status. A link cancelled before payment has no outcome.
 */
export function outcomeFromEvents(events: readonly HistoryEvent[]): ClosedOutcome | null {
  const sorted = [...events].sort((a, b) => a.slot - b.slot || a.index - b.index);
  let start = -1;
  sorted.forEach((e, i) => {
    if (e.type === "OrderCreated") start = i;
  });
  if (start < 0) return null;
  const life = sorted.slice(start);
  const created = life[0].payload;
  const paid = life.find((e) => e.type === "OrderPaid")?.payload;
  const end = [...life].reverse().find((e) => ["OrderReleased", "OrderRefunded", "DisputeResolved"].includes(e.type));
  if (!end) return null;

  const base = {
    seller: String(created.seller ?? ""),
    buyer: paid?.buyer ? String(paid.buyer) : null,
    amount: units(created.amount),
    listingHash: String(created.listing_hash ?? ""),
  };
  const p = end.payload;
  switch (end.type) {
    case "OrderReleased":
      return { ...base, status: "Released", sellerAmount: units(p.seller_amount), buyerAmount: 0n, fee: units(p.fee) };
    case "OrderRefunded":
      return { ...base, status: "Refunded", sellerAmount: 0n, buyerAmount: units(p.buyer_amount), fee: 0n };
    default:
      return {
        ...base,
        status: "Resolved",
        sellerAmount: units(p.seller_amount),
        buyerAmount: units(p.buyer_amount),
        fee: units(p.fee),
      };
  }
}

export function outcomeToJson(o: ClosedOutcome): ClosedOutcomeJson {
  return {
    ...o,
    amount: o.amount.toString(),
    sellerAmount: o.sellerAmount.toString(),
    buyerAmount: o.buyerAmount.toString(),
    fee: o.fee.toString(),
  };
}

export function outcomeFromJson(o: ClosedOutcomeJson): ClosedOutcome {
  return {
    ...o,
    amount: BigInt(o.amount),
    sellerAmount: BigInt(o.sellerAmount),
    buyerAmount: BigInt(o.buyerAmount),
    fee: BigInt(o.fee),
  };
}
