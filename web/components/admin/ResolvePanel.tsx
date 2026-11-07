"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useId, useState } from "react";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { computeDisputeSplit } from "@/lib/fees";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";

export interface ResolvePanelProps {
  orderPda: string;
  amount: bigint;
  feeBps: number;
  deposit: bigint;
  onResolved: () => void;
}

/**
 * The decision (03 §5.6): shortcuts or a split slider, with the exact amounts
 * from `fees.ts` before signing. The arbiter signs and pays: no sponsor.
 * Both sides get the same neutral treatment; no color takes a side.
 */
export function ResolvePanel({ orderPda, amount, feeBps, deposit, onResolved }: ResolvePanelProps) {
  const session = useSession();
  const queryClient = useQueryClient();
  const sliderId = useId();
  const [shareBps, setShareBps] = useState(5_000);
  const split = computeDisputeSplit(amount, feeBps, shareBps, deposit);
  const percent = (shareBps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });

  return (
    <section
      aria-labelledby={`${sliderId}-title`}
      className="flex flex-col gap-6 rounded-2xl border border-steel/15 bg-graphite p-5 sm:p-6"
    >
      <h3 id={`${sliderId}-title`} className="font-display text-title text-bone">
        Decisión
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <Button fullWidth variant="secondary" aria-pressed={shareBps === 10_000} onClick={() => setShareBps(10_000)}>
          Reembolsar todo
        </Button>
        <Button fullWidth variant="secondary" aria-pressed={shareBps === 0} onClick={() => setShareBps(0)}>
          Liberar todo
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor={sliderId} className="flex items-baseline justify-between gap-3 text-body text-bone">
          Dividir
          <span className="font-mono tabular-nums">{percent}% para el comprador</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={shareBps / 100}
          onChange={(e) => setShareBps(Number(e.target.value) * 100)}
          className="h-11 w-full accent-ion-blue"
        />
        {/* The split, drawn: buyer's share from the left, seller's from the right. */}
        <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-vault-black">
          <span className="bg-bone transition-[width] duration-200" style={{ width: `${shareBps / 100}%` }} />
          <span className="flex-1 bg-steel/50" />
        </div>
      </div>

      <dl className="flex flex-col">
        <div className="flex items-baseline justify-between gap-4 border-t border-steel/15 py-3">
          <dt className="flex items-center gap-2 text-bone">
            <span aria-hidden="true" className="size-2 rounded-sm bg-bone" />
            Comprador
            {split.depositToBuyer && deposit > 0n ? <span className="text-label text-steel">(incluye el depósito)</span> : null}
          </dt>
          <dd className="font-mono tabular-nums text-bone">{formatUsdc(split.buyerTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-steel/15 py-3">
          <dt className="flex items-center gap-2 text-bone">
            <span aria-hidden="true" className="size-2 rounded-sm bg-steel/50" />
            Vendedor
            {!split.depositToBuyer && deposit > 0n ? <span className="text-label text-steel">(incluye el depósito)</span> : null}
          </dt>
          <dd className="font-mono tabular-nums text-bone">{formatUsdc(split.sellerTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-steel/15 py-3 text-steel">
          <dt>Comisión</dt>
          <dd className="font-mono tabular-nums">{formatUsdc(split.fee)}</dd>
        </div>
      </dl>

      <TxButton
        fullWidth
        label={`Firmá la decisión (${percent}% comprador)`}
        signer={session.pubkey}
        sponsored={false}
        successMessage="Listo: el reclamo quedó resuelto."
        invalidate={[vaultixKeys.order(orderPda)]}
        build={(client) =>
          client.buildResolveDisputeTx({ order: new PublicKey(orderPda), arbiter: session.pubkey!, buyerShareBps: shareBps })
        }
        onConfirmed={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });
          onResolved();
        }}
      />
    </section>
  );
}
