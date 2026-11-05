import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { nextStep } from "./next-step";
import type { OrderAccount, OrderStatus } from "./vaultix/contract";

// 2026-11-12 17:30 UTC (14:30 in Buenos Aires) as the Paid deadline.
const PAID_AT = BigInt(Date.UTC(2026, 10, 7, 17, 30) / 1000);
const SHIP_BY = PAID_AT + 432_000n;

function order(status: OrderStatus, patch: Partial<OrderAccount> = {}): OrderAccount {
  return {
    status,
    seller: Keypair.generate().publicKey,
    buyer: null,
    orderId: 1n,
    mint: Keypair.generate().publicKey,
    amount: 1n,
    feeBps: 150,
    disputeDepositBps: 500,
    shipDeadlineSecs: 432_000n,
    claimWindowSecs: 864_000n,
    listingHash: new Uint8Array(32),
    trackingHash: null,
    disputeDeposit: 0n,
    createdAt: 1n,
    paidAt: PAID_AT,
    shippedAt: PAID_AT,
    rentPayer: Keypair.generate().publicKey,
    bump: 255,
    ...patch,
  };
}

describe("nextStep", () => {
  it("shows the seller's ship-by date, ember in the last 24 h (03 §5.5)", () => {
    expect(nextStep(order("Paid"), "seller", PAID_AT)).toEqual({ text: "Despachá antes del 12/11", urgent: false, action: true });
    expect(nextStep(order("Paid"), "seller", SHIP_BY - 3_600n)).toMatchObject({ urgent: true });
    expect(nextStep(order("Paid"), "seller", SHIP_BY + 1n).text).toBe("Venció el plazo para despachar");
  });

  it("tells the buyer when to act", () => {
    expect(nextStep(order("Paid"), "buyer", SHIP_BY + 1n)).toMatchObject({ text: "Pedí el reembolso", action: true });
    expect(nextStep(order("Shipped"), "buyer", PAID_AT).text).toMatch(/^Confirmá cuando llegue \(hasta el \d\d\/\d\d\)$/);
    expect(nextStep(order("Disputed"), "buyer", PAID_AT).text).toMatch(/evidencia/);
  });

  it("covers every status for both roles, and closed orders", () => {
    const statuses: OrderStatus[] = ["Created", "Paid", "Shipped", "Disputed", "Released", "Refunded", "Resolved"];
    for (const s of statuses) {
      for (const role of ["seller", "buyer"] as const) expect(nextStep(order(s), role, PAID_AT).text).toBeTruthy();
    }
    expect(nextStep(null, "seller", PAID_AT)).toEqual({ text: "Cerrada", urgent: false, action: false });
  });
});
