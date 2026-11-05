/**
 * How each on-chain status looks in the UI (specs/03-frontend.md §3).
 * Colors are token names from styles/tokens.css, never hex.
 */
import { ORDER_STATUSES, type OrderStatus } from "./vaultix/contract";

export type StatusColorToken = "steel" | "ultra-violet" | "ion-blue" | "plasma" | "released";

export interface StatusDisplay {
  label: string;
  color: StatusColorToken;
}

export const ORDER_STATUS_DISPLAY: Record<OrderStatus, StatusDisplay> = {
  Created: { label: "Creado", color: "steel" },
  Paid: { label: "En bóveda", color: "ultra-violet" },
  Shipped: { label: "Enviado", color: "ion-blue" },
  Disputed: { label: "En disputa", color: "plasma" },
  Released: { label: "Liberado", color: "released" },
  Refunded: { label: "Reembolsado", color: "steel" },
  Resolved: { label: "Resuelto", color: "steel" },
};

export function statusDisplay(status: OrderStatus): StatusDisplay {
  return ORDER_STATUS_DISPLAY[status];
}

/** `var(--token)` for inline styles. */
export function statusColorVar(status: OrderStatus): string {
  return `var(--${ORDER_STATUS_DISPLAY[status].color})`;
}

/** The enum discriminant (first byte after the account discriminator) to a status. */
export function statusFromIndex(index: number): OrderStatus {
  const status = ORDER_STATUSES[index];
  if (status === undefined) throw new RangeError(`Unknown order status index: ${index}`);
  return status;
}
