import { statusDisplay, type StatusColorToken } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/vaultix/contract";

/**
 * The path each status sits on, from the program's own transitions:
 * Created → Paid → Shipped → Released, Shipped → Disputed → Resolved,
 * Paid → Refunded. Nothing here is a state the contract doesn't have.
 */
const PATHS: Record<OrderStatus, readonly OrderStatus[]> = {
  Created: ["Created", "Paid", "Shipped", "Released"],
  Paid: ["Created", "Paid", "Shipped", "Released"],
  Shipped: ["Created", "Paid", "Shipped", "Released"],
  Released: ["Created", "Paid", "Shipped", "Released"],
  Disputed: ["Created", "Paid", "Shipped", "Disputed", "Resolved"],
  Resolved: ["Created", "Paid", "Shipped", "Disputed", "Resolved"],
  Refunded: ["Created", "Paid", "Refunded"],
};

// Full class names so Tailwind can see them.
const BAR: Record<StatusColorToken, string> = {
  steel: "bg-steel",
  "ultra-violet": "bg-ultra-violet",
  "ion-blue": "bg-ion-blue",
  plasma: "bg-plasma",
  released: "bg-released",
};

const COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/** Where the order is on its way: each reached step lit in its status color (05 §7.4). */
export function OrderTrack({ status }: { status: OrderStatus }) {
  const path = PATHS[status];
  const current = path.indexOf(status);

  return (
    <nav aria-label="Estado del pedido">
      <ol className={`grid gap-1.5 ${COLS[path.length]}`}>
        {path.map((step, i) => {
          const { label, color } = statusDisplay(step);
          const reached = i <= current;
          const isCurrent = i === current;
          return (
            <li key={step} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
              <span
                aria-hidden="true"
                className={`h-1 rounded-full transition-colors duration-500 ${reached ? BAR[color] : "bg-steel/20"}`}
              />
              <span
                className={`font-mono text-label uppercase leading-tight break-words ${isCurrent ? "text-bone" : "text-steel"}`}
              >
                {label}
                <span className="sr-only">{isCurrent ? " (ahora)" : reached ? " (hecho)" : " (pendiente)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
