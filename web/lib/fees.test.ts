// Same cases as the program tests (shared/payout.rs, release.rs, dispute.rs).
import { describe, expect, it } from "vitest";

import { bpsOf, computeDisputeSplit, computeReleaseSplit, disputeDepositFor } from "./fees";
import { U64_MAX, isVaultixError } from "./vaultix/contract";

const AMOUNT = 100_000_000n; // USDC 100
const DEPOSIT = 5_000_000n; // 5% deposit

describe("computeReleaseSplit", () => {
  it("charges 1.5% and gives the rest to the seller", () => {
    expect(computeReleaseSplit(AMOUNT, 150)).toEqual({ fee: 1_500_000n, sellerNet: 98_500_000n });
  });

  it("rounds the fee down", () => {
    expect(computeReleaseSplit(1n, 150)).toEqual({ fee: 0n, sellerNet: 1n });
    expect(computeReleaseSplit(66n, 150)).toEqual({ fee: 0n, sellerNet: 66n });
    expect(computeReleaseSplit(67n, 150)).toEqual({ fee: 1n, sellerNet: 66n });
    expect(computeReleaseSplit(1_000n, 0)).toEqual({ fee: 0n, sellerNet: 1_000n });
  });
});

describe("computeDisputeSplit", () => {
  const split = (share: number) => computeDisputeSplit(AMOUNT, 150, share, DEPOSIT);

  it("0%: everything to the seller, minus the fee, plus the deposit", () => {
    expect(split(0)).toMatchObject({
      buyerPart: 0n,
      sellerNet: 98_500_000n,
      fee: 1_500_000n,
      depositToBuyer: false,
      buyerTotal: 0n,
      sellerTotal: 103_500_000n,
    });
  });

  it("33.33%: fee only on the seller's part", () => {
    expect(split(3_333)).toMatchObject({
      buyerPart: 33_330_000n,
      sellerGross: 66_670_000n,
      sellerNet: 65_669_950n,
      fee: 1_000_050n,
      depositToBuyer: false,
      buyerTotal: 33_330_000n,
      sellerTotal: 70_669_950n,
    });
  });

  it("50%: the deposit goes back to the buyer", () => {
    expect(split(5_000)).toMatchObject({
      buyerPart: 50_000_000n,
      sellerNet: 49_250_000n,
      fee: 750_000n,
      depositToBuyer: true,
      buyerTotal: 55_000_000n,
      sellerTotal: 49_250_000n,
    });
  });

  it("100%: full refund plus deposit, no fee", () => {
    expect(split(10_000)).toMatchObject({
      buyerPart: AMOUNT,
      sellerNet: 0n,
      fee: 0n,
      depositToBuyer: true,
      buyerTotal: AMOUNT + DEPOSIT,
      sellerTotal: 0n,
    });
  });

  it("always adds up to amount + deposit", () => {
    for (const amount of [1n, 7n, 67n, 999_999n, 500_000_000n]) {
      for (const share of [0, 1, 3_333, 4_999, 5_000, 9_999, 10_000]) {
        const s = computeDisputeSplit(amount, 150, share, 3n);
        expect(s.buyerPart + s.sellerNet + s.fee).toBe(amount);
        expect(s.buyerTotal + s.sellerTotal + s.fee).toBe(amount + 3n);
      }
    }
  });

  it("rejects a share above 100%", () => {
    expect(() => split(10_001)).toThrow();
    try {
      split(10_001);
    } catch (err) {
      expect(isVaultixError(err, "InvalidShareBps")).toBe(true);
    }
  });
});

describe("bpsOf / disputeDepositFor", () => {
  it("computes the 5% deposit", () => {
    expect(disputeDepositFor(AMOUNT, 500)).toBe(DEPOSIT);
  });

  it("does not overflow on the max u64", () => {
    expect(bpsOf(U64_MAX, 10_000)).toBe(U64_MAX);
  });

  it("rejects negative amounts and non-u16 bps", () => {
    expect(() => bpsOf(-1n, 150)).toThrow();
    expect(() => bpsOf(1n, 1.5)).toThrow(RangeError);
    expect(() => bpsOf(1n, 70_000)).toThrow(RangeError);
  });
});
