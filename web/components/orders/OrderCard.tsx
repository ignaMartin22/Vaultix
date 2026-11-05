import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/Card";
import { formatUsdc } from "@/lib/amounts";
import type { MyOrder } from "@/lib/my-orders-client";
import type { NextStep } from "@/lib/next-step";
import type { OrderAccount } from "@/lib/vaultix/contract";

export interface OrderCardProps {
  item: MyOrder;
  /** undefined while loading, null once closed. */
  order: OrderAccount | null | undefined;
  step: NextStep | null;
}

/** 03 §5.5: photo, title, amount, status and the next action or deadline. */
export function OrderCard({ item, order, step }: OrderCardProps) {
  const amount = order?.amount ?? (item.amountUnits ? BigInt(item.amountUnits) : null);
  return (
    <Link href={`/p/${item.orderPda}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-ion-blue">
      <Card className="flex gap-3 hover:border-ion-blue">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing cover, size unknown
          <img src={item.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-vault-black object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-xl bg-vault-black" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-body font-medium text-bone">{item.title ?? "Producto"}</span>
            {order ? <StatusBadge status={order.status} /> : null}
          </div>
          {amount !== null ? <span className="font-mono text-label text-bone">{formatUsdc(amount)}</span> : null}
          {step ? (
            <span className={`text-label ${step.urgent ? "text-ember" : step.action ? "text-bone" : "text-steel"}`}>
              {step.text}
            </span>
          ) : (
            <span className="text-label text-steel">Cargando…</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
