"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/auth/session";
import { nowSecs } from "@/lib/deadlines";
import { getMyOrders, getStatuses } from "@/lib/my-orders-client";
import { nextStep } from "@/lib/next-step";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";

import { OrderCard } from "./OrderCard";

type Tab = "sales" | "purchases";

/** `/orders` (03 §5.5): "Ventas" and "Compras", status read on-chain in one batch. */
export function OrdersPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("sales");
  const owner = session.pubkey;

  const list = useQuery({
    queryKey: ["my-orders", owner?.toBase58()],
    queryFn: () => getMyOrders(owner!, session.getAccessToken),
    enabled: !!owner,
  });
  const items = list.data ? [...list.data.sales, ...list.data.purchases] : [];
  const pdas = [...new Set(items.map((i) => i.orderPda))];
  const statuses = useQuery({
    queryKey: [...vaultixKeys.orders, "batch", pdas],
    queryFn: () => getStatuses(pdas),
    enabled: pdas.length > 0,
  });

  if (!session.ready) return <p className="text-steel">Cargando…</p>;
  if (!session.authenticated) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-title font-semibold">Mis compras y ventas</h1>
        <p className="text-steel">Entrá para ver tus links y tus compras.</p>
        <Button onClick={session.login}>Entrar</Button>
      </div>
    );
  }

  const shown = tab === "sales" ? (list.data?.sales ?? []) : (list.data?.purchases ?? []);
  const now = nowSecs();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-semibold">Mis compras y ventas</h1>

      <div role="tablist" aria-label="Ventas y compras" className="grid grid-cols-2 gap-1 rounded-xl bg-graphite p-1">
        {(
          [
            ["sales", "Ventas"],
            ["purchases", "Compras"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-11 rounded-lg text-body font-medium ${tab === key ? "bg-vault-black text-bone" : "text-steel"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.isPending ? <p className="text-steel">Cargando…</p> : null}
      {list.isError ? <p className="text-plasma">No pudimos cargar tus órdenes. Probá de nuevo en un rato.</p> : null}

      {list.data && shown.length === 0 ? (
        tab === "sales" ? (
          <div className="flex flex-col gap-3">
            <p className="text-steel">Todavía no creaste ningún link.</p>
            <Link
              href="/sell"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-ion-blue px-5 text-body font-medium text-bone"
            >
              Creá tu link de pago
            </Link>
          </div>
        ) : (
          <p className="text-steel">Todavía no compraste nada con Vaultix.</p>
        )
      ) : null}

      <ul className="flex flex-col gap-2">
        {shown.map((item) => {
          const order = statuses.data?.get(item.orderPda);
          return (
            <li key={`${item.role}:${item.orderPda}`}>
              <OrderCard
                item={item}
                order={order}
                step={statuses.data ? nextStep(order ?? null, item.role, now) : null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
