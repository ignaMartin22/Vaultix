"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorNote, Loading, PageIntro } from "@/components/ui/Feedback";
import { useSession } from "@/lib/auth/session";
import { nowSecs } from "@/lib/deadlines";
import { getMyOrders, getStatuses } from "@/lib/my-orders-client";
import { nextStep } from "@/lib/next-step";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";

import { OrderCard } from "./OrderCard";

type Tab = "sales" | "purchases";

const TABS = [
  ["sales", "Ventas"],
  ["purchases", "Compras"],
] as const;

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

  if (!session.ready) return <Loading />;
  if (!session.authenticated) {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        <PageIntro eyebrow="Tu cuenta" title="Mis operaciones">
          Entrá para ver tus links, tus compras y qué te toca hacer en cada una.
        </PageIntro>
        <Button onClick={session.login}>Entrá con tu email o Google</Button>
      </div>
    );
  }

  const shown = tab === "sales" ? (list.data?.sales ?? []) : (list.data?.purchases ?? []);
  const count = (key: Tab) => (key === "sales" ? list.data?.sales.length : list.data?.purchases.length);
  const now = nowSecs();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro eyebrow="Tu cuenta" title="Mis operaciones" />
        <ButtonLink href="/sell" variant="secondary">
          Creá tu link de pago
        </ButtonLink>
      </div>

      <div className="flex flex-col">
        <div role="tablist" aria-label="Ventas y compras" className="flex gap-6 border-b border-steel/15">
          {TABS.map(([key, label]) => {
            const selected = tab === key;
            const n = count(key);
            return (
              <button
                key={key}
                id={`tab-${key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                className={`relative -mb-px flex h-12 items-center gap-2 border-b-2 text-body font-medium transition-colors ${
                  selected ? "border-ion-blue text-bone" : "border-transparent text-steel hover:text-bone"
                }`}
              >
                {label}
                {n !== undefined ? <span className="font-mono text-label text-steel">{n}</span> : null}
              </button>
            );
          })}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-2">
          {list.isPending ? <Loading className="py-8" /> : null}
          {list.isError ? (
            <ErrorNote className="py-8">No pudimos cargar tus operaciones. Probá de nuevo en un rato.</ErrorNote>
          ) : null}

          {list.data && shown.length === 0 ? (
            <div className="flex flex-col items-start gap-5 py-12">
              <p className="font-display text-title text-bone">
                {tab === "sales" ? "Todavía no creaste ningún link." : "Todavía no compraste nada con Vaultix."}
              </p>
              <p className="max-w-md text-body text-steel">
                {tab === "sales"
                  ? "Creá uno en un minuto y compartilo por WhatsApp o Instagram."
                  : "Cuando pagues con un link de Vaultix, la compra aparece acá con su estado."}
              </p>
              {tab === "sales" ? <ButtonLink href="/sell">Creá tu link de pago</ButtonLink> : null}
            </div>
          ) : null}

          {shown.length > 0 ? (
            <ul className="-mx-4 flex flex-col divide-y divide-steel/10 sm:mx-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-steel/15">
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
