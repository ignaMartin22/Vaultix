import type { ReactNode } from "react";

import { statusDisplay, type StatusColorToken } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/vaultix/contract";

// Full class names so Tailwind can see them.
export const STATUS_TEXT: Record<StatusColorToken, string> = {
  steel: "text-steel",
  "ultra-violet": "text-ultra-violet",
  "ion-blue": "text-ion-blue",
  plasma: "text-plasma",
  released: "text-released",
};

export const STATUS_EDGE: Record<StatusColorToken, string> = {
  steel: "border-steel/40",
  "ultra-violet": "border-ultra-violet/60",
  "ion-blue": "border-ion-blue/60",
  plasma: "border-plasma/60",
  released: "border-released/60",
};

// 16×16 line glyphs, 1.5 stroke, one per vault state.
const GLYPHS: Record<OrderStatus, ReactNode> = {
  // A link waiting to be paid.
  Created: (
    <path d="M6.5 9.5l3-3M7.2 4.3l.8-.8a2.6 2.6 0 0 1 3.7 3.7l-.8.8M8.8 11.7l-.8.8a2.6 2.6 0 0 1-3.7-3.7l.8-.8" />
  ),
  // The vault door, closed: the money is held.
  Paid: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 5.7V4.5M10.3 8h1.2" />
    </>
  ),
  // On its way.
  Shipped: (
    <>
      <path d="M1.75 4.5h7.5v6.25h-7.5zM9.25 6.75h2.75l2.25 2.25v1.75h-5" />
      <circle cx="4.5" cy="11.75" r="1.25" />
      <circle cx="11.75" cy="11.75" r="1.25" />
    </>
  ),
  // Someone raised a problem.
  Disputed: (
    <>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.25" r=".4" fill="currentColor" />
    </>
  ),
  // Paid out to the seller.
  Released: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.5 8.2l1.75 1.75L10.75 6.4" />
    </>
  ),
  // Back to the buyer.
  Refunded: <path d="M6 3.75L2.75 7 6 10.25M3.25 7h6.5a3 3 0 0 1 0 6H8" />,
  // An arbiter split it.
  Resolved: (
    <path d="M8 2.75v10.5M5.25 13.25h5.5M3.25 5h9.5M3.25 5L1.75 9a1.5 1.5 0 0 0 3 0zM12.75 5l-1.5 4a1.5 1.5 0 0 0 3 0z" />
  ),
};

/** The state's glyph in its color. Decorative: the label always travels with it. */
export function StatusIcon({ status, className = "size-4" }: { status: OrderStatus; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${STATUS_TEXT[statusDisplay(status).color]} ${className}`}
    >
      {GLYPHS[status]}
    </svg>
  );
}
