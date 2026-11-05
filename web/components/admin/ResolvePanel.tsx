"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
 */
export function ResolvePanel({ orderPda, amount, feeBps, deposit, onResolved }: ResolvePanelProps) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [shareBps, setShareBps] = useState(5_000);
  const split = computeDisputeSplit(amount, feeBps, shareBps, deposit);
  const percent = (shareBps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-subtitle font-semibold">Decisión</h3>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setShareBps(10_000)}>
          Reembolsar todo
        </Button>
        <Button variant="secondary" onClick={() => setShareBps(0)}>
          Liberar todo
        </Button>
      </div>

      <label className="flex flex-col gap-2 text-body text-bone">
        Dividir: {percent}% para el comprador
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={shareBps / 100}
          onChange={(e) => setShareBps(Number(e.target.value) * 100)}
          className="h-11 accent-ion-blue"
        />
      </label>

      <ul className="flex flex-col gap-1 font-mono text-body">
        <li>
          Comprador: {formatUsdc(split.buyerTotal)}
          {split.depositToBuyer && deposit > 0n ? <span className="text-steel"> (incluye el depósito)</span> : null}
        </li>
        <li>
          Vendedor: {formatUsdc(split.sellerTotal)}
          {!split.depositToBuyer && deposit > 0n ? <span className="text-steel"> (incluye el depósito)</span> : null}
        </li>
        <li className="text-steel">Comisión: {formatUsdc(split.fee)}</li>
      </ul>

      <TxButton
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
    </Card>
  );
}
