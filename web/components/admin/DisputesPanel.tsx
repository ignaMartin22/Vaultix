"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getAdminDisputes } from "@/lib/admin-client";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
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

  if (!session.ready || config.isPending) return <p className="text-steel">Cargando…</p>;
  if (!session.authenticated) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-steel">Entrá con tu cuenta para continuar.</p>
        <Button onClick={session.login}>Entrar</Button>
      </div>
    );
  }

  if (!isArbiter) {
    // Mock mode: let the tester take the arbiter role for this tab.
    const client = getVaultixClient();
    if (isMockClient(client) && session.pubkey) {
      return (
        <Button
          variant="secondary"
          onClick={() => {
            client.setConfig({ arbiter: session.pubkey! });
            void queryClient.invalidateQueries({ queryKey: vaultixKeys.config });
          }}
        >
          Modo prueba: hacé de árbitro con esta cuenta
        </Button>
      );
    }
    notFound();
  }

  const current = disputes.data?.find((d) => d.orderPda === selected);
  if (current) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="secondary" onClick={() => setSelected(null)}>
          Volver a la lista
        </Button>
        <DisputeDetail dispute={current} onResolved={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-semibold">Reclamos abiertos</h1>
      {disputes.isPending ? <p className="text-steel">Cargando…</p> : null}
      {disputes.isError ? <p className="text-plasma">No pudimos cargar los reclamos.</p> : null}
      {disputes.data?.length === 0 ? <p className="text-steel">No hay reclamos abiertos.</p> : null}
      <ul className="flex flex-col gap-2">
        {disputes.data?.map((d) => (
          <li key={d.orderPda}>
            <button type="button" className="w-full text-left" onClick={() => setSelected(d.orderPda)}>
              <Card className="flex items-center justify-between gap-2 hover:border-ion-blue">
                <span className="text-body text-bone">{d.listing?.title ?? d.orderPda}</span>
                <span className="font-mono text-label text-steel">
                  {formatUsdc(BigInt(d.order.amountUnits))} · {d.evidence.length} pruebas
                </span>
              </Card>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
