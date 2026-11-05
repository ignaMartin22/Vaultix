/**
 * Order deadlines, with the same boundaries as the program:
 * - `Paid`: the seller ships until `paid_at + ship_deadline_secs`; after it
 *   (`now > deadline`) anyone can `refund_unshipped`.
 * - `Shipped`: the buyer can dispute while `now <= shipped_at + claim_window_secs`;
 *   after it anyone can `release`.
 * Times are unix seconds as `bigint`.
 */
import type { OrderAccount } from "./vaultix/contract";

/** Deadlines closer than this are highlighted with `ember` (03 §3). */
export const URGENT_WINDOW_SECS = 24n * 60n * 60n;

export type DeadlineKind = "ship" | "claim";

export interface Deadline {
  kind: DeadlineKind;
  /** Last second at which the deadline still holds. */
  at: bigint;
}

type DeadlineFields = Pick<
  OrderAccount,
  "status" | "paidAt" | "shippedAt" | "shipDeadlineSecs" | "claimWindowSecs"
>;

/** The deadline running for the order's current status, if any. */
export function activeDeadline(order: DeadlineFields): Deadline | null {
  switch (order.status) {
    case "Paid":
      return { kind: "ship", at: order.paidAt + order.shipDeadlineSecs };
    case "Shipped":
      return { kind: "claim", at: order.shippedAt + order.claimWindowSecs };
    default:
      return null;
  }
}

export interface DeadlineState {
  /** `now > at`, as the program checks it. */
  expired: boolean;
  /** Seconds left; 0 once expired. */
  remainingSecs: bigint;
  /** Less than 24 h left and not expired yet. */
  urgent: boolean;
}

export function deadlineState(at: bigint, now: bigint): DeadlineState {
  const expired = now > at;
  const remainingSecs = expired ? 0n : at - now;
  return { expired, remainingSecs, urgent: !expired && remainingSecs < URGENT_WINDOW_SECS };
}

/** Current unix time in seconds. */
export function nowSecs(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** Countdown copy: "3 d 4 h", "5 h 20 min", "12 min", "menos de 1 min". */
export function formatRemaining(secs: bigint): string {
  const days = secs / 86_400n;
  const hours = (secs % 86_400n) / 3_600n;
  const minutes = (secs % 3_600n) / 60n;
  if (days > 0n) return hours > 0n ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0n) return minutes > 0n ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0n) return `${minutes} min`;
  return "menos de 1 min";
}
