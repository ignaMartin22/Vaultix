"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorNote, Loading, PageIntro } from "@/components/ui/Feedback";
import { getAdminDisputes } from "@/lib/admin-client";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { shortAddress } from "@/lib/format";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient, isMockClient } from "@/lib/vaultix/client";

import { DisputeDetail } from "./DisputeDetail";

/** `/admin/disputes` (03 §5.6): only for `config.arbiter`; anyone else gets a 404. */
export function DisputesPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const config = useQuery({ queryKey: vaultixKeys.config, queryFn: () => getVaultixClient().getConfig() });
  const isArbiter = !!session.pubkey && !!config.data && config.data.arbiter.equals(session.pubkey);

  const disputes = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: () => getAdminDisputes(session.getAccessToken),
    enabled: isArbiter,
  });

  if (!session.ready || config.isPending) return <Loading />;
  if (!session.authenticated) {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        <PageIntro eyebrow="Árbitro" title="Reclamos">
          Entrá con tu cuenta para continuar.
        </PageIntro>
        <Button onClick={session.login}>Entrar</Button>
      </div>
    );
  }

  if (!isArbiter) {
    // Mock mode: let the tester take the arbiter role for this tab.
    const client = getVaultixClient();
    if (isMockClient(client) && session.pubkey) {
      return (
        <div className="flex max-w-xl flex-col gap-8">
          <PageIntro eyebrow="Modo prueba" title="Reclamos">
            Esta cuenta no es la del árbitro. En modo prueba podés tomar ese rol para esta pestaña.
          </PageIntro>
          <Button
            variant="secondary"
            onClick={() => {
              client.setConfig({ arbiter: session.pubkey! });
              void queryClient.invalidateQueries({ queryKey: vaultixKeys.config });
            }}
          >
            Hacé de árbitro con esta cuenta
          </Button>
        </div>
      );
    }
    notFound();
  }

  const current = disputes.data?.find((d) => d.orderPda === selected);

  return (
    <div className="flex flex-col gap-10">
      <PageIntro eyebrow="Árbitro" title="Reclamos abiertos" />

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-12">
        {/* Mobile shows either the list or one dispute; desktop both. */}
        <section aria-label="Lista de reclamos" className={current ? "hidden lg:block" : ""}>
          {disputes.isPending ? <Loading /> : null}
          {disputes.isError ? <ErrorNote>No pudimos cargar los reclamos.</ErrorNote> : null}
          {disputes.data?.length === 0 ? <p className="text-body text-steel">No hay reclamos abiertos.</p> : null}
          {disputes.data && disputes.data.length > 0 ? (
            <ul className="flex flex-col divide-y divide-steel/10 overflow-hidden rounded-2xl border border-steel/15">
              {disputes.data.map((d) => {
                const active = d.orderPda === selected;
                return (
                  <li key={d.orderPda}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelected(d.orderPda)}
                      className={`flex w-full flex-col gap-1 px-4 py-4 text-left transition-colors focus-visible:outline-offset-[-2px] ${
                        active ? "bg-graphite" : "hover:bg-graphite/60"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {active ? <span aria-hidden="true" className="size-1.5 rotate-45 bg-plasma" /> : null}
                        <span className="truncate text-body font-medium text-bone">
                          {d.listing?.title ?? shortAddress(d.orderPda)}
                        </span>
                      </span>
                      <span className="font-mono text-label text-steel">
                        {formatUsdc(BigInt(d.order.amountUnits))} · {d.evidence.length}{" "}
                        {d.evidence.length === 1 ? "prueba" : "pruebas"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section aria-label="Reclamo seleccionado" className={current ? "" : "hidden lg:block"}>
          {current ? (
            <div className="flex flex-col gap-6">
              <Button variant="ghost" className="self-start lg:hidden" onClick={() => setSelected(null)}>
                ← Volver a la lista
              </Button>
              <DisputeDetail dispute={current} onResolved={() => setSelected(null)} />
            </div>
          ) : disputes.data && disputes.data.length > 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-steel/20 p-8 text-center text-body text-steel">
              Elegí un reclamo de la lista para revisarlo.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
