import Link from "next/link";

import { LogoIsotype } from "@/components/Logo";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_EDGE, StatusIcon } from "@/components/StatusIcon";
import { formatUsdc } from "@/lib/amounts";
import type { MyOrder } from "@/lib/my-orders-client";
import type { NextStep } from "@/lib/next-step";
import { statusDisplay } from "@/lib/order-status";
import type { OrderAccount } from "@/lib/vaultix/contract";

export interface OrderCardProps {
  item: MyOrder;
  /** undefined while loading, null once closed. */
  order: OrderAccount | null | undefined;
  step: NextStep | null;
}

/**
 * 03 §5.5: one row per operation: photo, title, the next step (what you do,
 * or the deadline), status and amount. Rows, not cards: it's a ledger.
 */
export function OrderCard({ item, order, step }: OrderCardProps) {
  // Once the crank closes a finished order, its status comes from the events.
  const status = order ? order.status : order === null ? item.endedAs : null;
  const tone = status ? statusDisplay(status).color : null;
  const amount = order?.amount ?? (item.amountUnits ? BigInt(item.amountUnits) : null);
  return (
    <Link
      href={`/p/${item.orderPda}`}
      className="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-graphite focus-visible:outline-offset-[-2px] sm:grid-cols-[4rem_minmax(0,1fr)_9rem_8rem] sm:px-5"
    >
      {/* The photo carries the vault's state: a colored edge and its glyph in the corner. */}
      <div className="relative col-start-1 row-span-2 row-start-1 size-14 sm:row-span-1 sm:size-16">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing cover, size unknown
          <img
            src={item.photoUrl}
            alt=""
            className={`size-full rounded-xl border bg-graphite object-cover ${tone ? STATUS_EDGE[tone] : "border-steel/15"}`}
          />
        ) : (
          <div
            aria-hidden="true"
            className={`flex size-full items-center justify-center rounded-xl border bg-graphite ${tone ? STATUS_EDGE[tone] : "border-steel/15 text-steel/30"}`}
          >
            {status ? <StatusIcon status={status} className="size-6" /> : <LogoIsotype size={24} />}
          </div>
        )}
        {item.photoUrl && status ? (
          <span
            aria-hidden="true"
            className={`absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border bg-vault-black ${STATUS_EDGE[tone!]}`}
          >
            <StatusIcon status={status} className="size-3.5" />
          </span>
        ) : null}
      </div>

      <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1">
        <span className="truncate text-body font-medium text-bone">{item.title ?? "Producto"}</span>
        {step ? (
          <span
            className={`flex items-center gap-2 text-label ${step.urgent ? "text-ember" : step.action ? "text-bone" : "text-steel"}`}
          >
            {step.action || step.urgent ? (
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rotate-45 ${step.urgent ? "bg-ember" : "bg-ion-blue"}`}
              />
            ) : null}
            {step.text}
          </span>
        ) : (
          <span className="text-label text-steel">Cargando…</span>
        )}
      </div>

      {/* Mobile: amount beside the title, status under it. sm+: one line, status then amount. */}
      <span className="col-start-3 row-start-1 text-right font-mono text-body tabular-nums text-bone sm:col-start-4">
        {amount !== null ? formatUsdc(amount) : "—"}
      </span>
      <span className="col-span-2 col-start-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        {status ? <StatusBadge status={status} /> : null}
      </span>
    </Link>
  );
}
