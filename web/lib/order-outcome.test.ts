import { describe, expect, it } from "vitest";

import { outcomeFromEvents, outcomeFromJson, outcomeToJson, type HistoryEvent } from "./order-outcome";

const SELLER = "AgPfzQo6EUMXqR6Ze1idYQdSL1gvBZdMJsU3BHkwktCq";
const BUYER = "5WNMrZZc6UzMcn7cAZkzwn5BzyYJnxqt1DweHeh6fM3Q";
const HASH = "ab".repeat(32);

let slot = 100;
function ev(type: string, payload: Record<string, unknown>): HistoryEvent {
  return { type, payload, slot: slot++, index: 0 };
}
const created = (hash = HASH) => ev("OrderCreated", { seller: SELLER, amount: "10000000", listing_hash: hash });
const paid = () => ev("OrderPaid", { buyer: BUYER, amount: "10000000" });

describe("outcomeFromEvents", () => {
  it("a release: what the seller got and the fee", () => {
    const out = outcomeFromEvents([
      created(),
      paid(),
      ev("OrderShipped", {}),
      ev("OrderReleased", { seller_amount: "9850000", fee: "150000" }),
      ev("OrderClosed", {}),
    ]);
    expect(out).toEqual({
      status: "Released",
      seller: SELLER,
      buyer: BUYER,
      amount: 10_000_000n,
      listingHash: HASH,
      sellerAmount: 9_850_000n,
      buyerAmount: 0n,
      fee: 150_000n,
    });
  });

  it("a refund: everything back to the buyer, no fee", () => {
    const out = outcomeFromEvents([created(), paid(), ev("OrderRefunded", { buyer_amount: "10000000" })]);
    expect(out).toMatchObject({ status: "Refunded", buyerAmount: 10_000_000n, sellerAmount: 0n, fee: 0n });
  });

  it("a resolved dispute: the arbiter's split", () => {
    const out = outcomeFromEvents([
      created(),
      paid(),
      ev("DisputeOpened", { deposit: "500000" }),
      ev("DisputeResolved", { buyer_amount: "10500000", seller_amount: "0", fee: "0" }),
    ]);
    expect(out).toMatchObject({ status: "Resolved", buyerAmount: 10_500_000n, sellerAmount: 0n, fee: 0n });
  });

  it("no outcome for a link cancelled before payment", () => {
    expect(outcomeFromEvents([created(), ev("OrderClosed", {})])).toBeNull();
    expect(outcomeFromEvents([])).toBeNull();
  });

  it("only the latest life counts when the address was reused", () => {
    const old = [created("cd".repeat(32)), paid(), ev("OrderReleased", { seller_amount: "1", fee: "0" }), ev("OrderClosed", {})];
    expect(outcomeFromEvents([...old, created()])).toBeNull();
  });

  it("orders by slot, then by index inside a transaction", () => {
    const a = { type: "OrderCreated", payload: { seller: SELLER, amount: "1", listing_hash: HASH }, slot: 5, index: 0 };
    const b = { type: "OrderRefunded", payload: { buyer_amount: "1" }, slot: 5, index: 1 };
    expect(outcomeFromEvents([b, a])?.status).toBe("Refunded");
  });

  it("survives the JSON round trip", () => {
    const out = outcomeFromEvents([created(), paid(), ev("OrderRefunded", { buyer_amount: "10000000" })])!;
    expect(outcomeFromJson(JSON.parse(JSON.stringify(outcomeToJson(out))))).toEqual(out);
  });
});
