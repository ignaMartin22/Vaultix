"use client";

import { useQuery } from "@tanstack/react-query";

import { days, percent } from "@/components/RulesSummary";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";

/**
 * The rules in numbers, read from the vault's own config (never typed by
 * hand): what Vaultix charges, and the deadlines both parties live by.
 * "Sin letra chica" (05 §1), so it sits in the open, at reading size.
 */
export function RulesFacts() {
  const config = useQuery({
    queryKey: vaultixKeys.config,
    queryFn: () => getVaultixClient().getConfig(),
    // One retry: a slow network should turn into a clear message, not a long "…".
    retry: 1,
  });
  const c = config.data;
  // Pending: an ellipsis; failed or no config: a dash. Never a made-up number.
  const value = (v: string | null | undefined) => v ?? (config.isPending ? "…" : "—");

  const facts = [
    { label: "Comisión", value: value(c && percent(c.feeBps)), note: "Solo cuando el vendedor cobra. Si hay reembolso, no se cobra nada." },
    { label: "Plazo para despachar", value: value(c && days(c.shipDeadlineSecs)), note: "Desde el pago. Si no despacha a tiempo, se devuelve todo." },
    { label: "Plazo para reclamar", value: value(c && days(c.claimWindowSecs)), note: "Desde el envío. Después, el pago se libera solo." },
    { label: "Depósito para reclamar", value: value(c && percent(c.disputeDepositBps)), note: "Del monto. Vuelve al comprador si le dan la razón." },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl
        aria-busy={config.isPending}
        className="grid overflow-hidden rounded-2xl border border-steel/15 sm:grid-cols-2 lg:grid-cols-4"
      >
        {facts.map((f) => (
          <div
            key={f.label}
            className="flex flex-col gap-2 border-steel/15 bg-graphite p-5 not-first:border-t sm:p-6 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l lg:not-first:border-t-0 lg:not-first:border-l"
          >
            <dt className="text-body text-steel">{f.label}</dt>
            <dd className="font-mono text-title tabular-nums text-bone">{f.value}</dd>
            <dd className="text-body text-steel text-pretty">{f.note}</dd>
          </div>
        ))}
      </dl>
      <p aria-live="polite" className="text-body text-steel empty:hidden">
        {config.isPending
          ? "Leyendo las reglas de la bóveda…"
          : config.isError || !c
            ? "No pudimos leer las reglas de la bóveda ahora. Probá de nuevo en un rato."
            : null}
      </p>
    </div>
  );
}
