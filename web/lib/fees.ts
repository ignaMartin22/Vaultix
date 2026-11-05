/**
 * Fee and dispute-split math, identical to the program (specs/02-backend.md §1.5):
 * checked u64, floor rounding, remainder to the seller. Shared by the UI
 * (previews), the mock client and the backend.
 */
import { BPS_DENOMINATOR, U64_MAX, VaultixError } from "./vaultix/contract";

/** Throws `MathOverflow` outside the u64 range, as `checked_*` does on-chain. */
export function checkedU64(value: bigint): bigint {
  if (value < 0n || value > U64_MAX) throw new VaultixError("MathOverflow");
  return value;
}

/** `amount * bps / 10_000`, rounded down. */
export function bpsOf(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 0xffff) {
    throw new RangeError(`bps must be a u16, got ${bps}`);
  }
  // u128 intermediate in Rust: amount (u64) * bps (u16) cannot overflow it.
  return checkedU64((checkedU64(amount) * BigInt(bps)) / BPS_DENOMINATOR);
}

export interface ReleaseSplit {
  fee: bigint;
  sellerNet: bigint;
}

/** `confirm_receipt` / `release`: seller gets `amount − fee`, treasury `fee`. */
export function computeReleaseSplit(amount: bigint, feeBps: number): ReleaseSplit {
  const fee = bpsOf(amount, feeBps);
  return { fee, sellerNet: checkedU64(amount - fee) };
}

export interface DisputeSplit {
  buyerPart: bigint;
  sellerGross: bigint;
  fee: bigint;
  sellerNet: bigint;
  /** The deposit goes back to the buyer when they get ≥ 50%. */
  depositToBuyer: boolean;
  /** Totals actually transferred, deposit included on its side. */
  buyerTotal: bigint;
  sellerTotal: bigint;
}

/** `resolve_dispute`: the fee is charged only on the seller's part. */
export function computeDisputeSplit(
  amount: bigint,
  feeBps: number,
  buyerShareBps: number,
  deposit: bigint,
): DisputeSplit {
  if (!Number.isInteger(buyerShareBps) || buyerShareBps < 0 || buyerShareBps > 10_000) {
    throw new VaultixError("InvalidShareBps");
  }
  const buyerPart = bpsOf(amount, buyerShareBps);
  const sellerGross = checkedU64(amount - buyerPart);
  const fee = bpsOf(sellerGross, feeBps);
  const sellerNet = checkedU64(sellerGross - fee);
  const depositToBuyer = buyerShareBps >= 5_000;
  return {
    buyerPart,
    sellerGross,
    fee,
    sellerNet,
    depositToBuyer,
    buyerTotal: checkedU64(buyerPart + (depositToBuyer ? deposit : 0n)),
    sellerTotal: checkedU64(sellerNet + (depositToBuyer ? 0n : deposit)),
  };
}

/** Deposit the buyer locks when calling `open_dispute`. */
export function disputeDepositFor(amount: bigint, disputeDepositBps: number): bigint {
  return bpsOf(amount, disputeDepositBps);
}
