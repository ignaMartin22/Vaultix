"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { disputeDepositFor } from "@/lib/fees";
import { useVaultixTx, vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { TopUpSheet } from "./TopUpSheet";

const PHASE = { signing: "Confirmá en tu cuenta…", sending: "Enviando…", confirming: "Confirmando…" } as const;

/** "Tengo un problema" (03 §5.3): the rules and the deposit, calmly, then `open_dispute`. */
export function DisputeSheet({
  open,
  onClose,
  orderPda,
  order,
}: {
  open: boolean;
  onClose: () => void;
  orderPda: string;
  order: OrderAccount;
}) {
  const session = useSession();
  const [topUp, setTopUp] = useState(false);
  const deposit = disputeDepositFor(order.amount, order.disputeDepositBps);

  const dispute = useVaultixTx({
    signer: session.pubkey,
    successMessage: "Abriste un reclamo. Ahora ambos suben evidencia.",
    invalidate: [vaultixKeys.order(orderPda), ...(session.pubkey ? [vaultixKeys.balance(session.pubkey.toBase58())] : [])],
    build: (client) => client.buildOpenDisputeTx({ order: new PublicKey(orderPda), buyer: session.pubkey! }),
    onConfirmed: onClose,
  });

  async function openDispute() {
    if (!session.pubkey) return;
    const balance = await getVaultixClient().getUsdcBalance(session.pubkey);
    if (balance < deposit) return setTopUp(true);
    await dispute.run();
  }

  return (
    <>
      <Sheet open={open && !topUp} onClose={onClose} title="¿Qué pasó?">
        <div className="flex flex-col gap-5 text-body">
          <p className="text-bone">Tu plata sigue en bóveda. Nadie la puede mover mientras se revisa el reclamo.</p>
          <ol className="flex flex-col">
            {[
              `Para abrirlo dejás un depósito de ${formatUsdc(deposit)}. Si te dan la razón (la mitad o más), te lo devolvemos.`,
              "Después, vos y el vendedor suben fotos, videos o notas.",
              "Un árbitro revisa todo y decide cómo se reparte el pago.",
            ].map((line, i) => (
              <li key={line} className="flex gap-4 border-t border-steel/15 py-3 text-steel">
                <span className="font-mono text-label leading-6">{String(i + 1).padStart(2, "0")}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <p className="text-steel">Si el problema se puede resolver hablando con el vendedor, probá primero eso.</p>
          <div className="flex flex-col gap-3">
            <Button fullWidth variant="destructive" disabled={dispute.busy} onClick={() => void openDispute()}>
              {dispute.phase in PHASE ? PHASE[dispute.phase as keyof typeof PHASE] : `Abrí el reclamo (${formatUsdc(deposit)})`}
            </Button>
            <Button fullWidth variant="secondary" onClick={onClose}>
              Volver
            </Button>
          </div>
        </div>
      </Sheet>
      {session.pubkey ? (
        <TopUpSheet
          open={topUp}
          onClose={() => setTopUp(false)}
          owner={session.pubkey}
          needed={deposit}
          onEnough={() => setTopUp(false)}
        />
      ) : null}
    </>
  );
}
