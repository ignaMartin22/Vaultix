"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { TxButton } from "@/components/TxButton";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { activeDeadline } from "@/lib/deadlines";
import { getShipment } from "@/lib/order-client";
import { LIVE_POLL_MS } from "@/lib/order-status";
import { CARRIER_LABELS, CARRIER_SITES } from "@/lib/tracking";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { Deadline } from "./Deadline";
import { DisputeSheet } from "./DisputeSheet";
import { Evidence } from "./EvidenceSheet";
import { FactBlock, StateNote } from "./StateNote";
import { useExpired } from "./useExpired";

/** Buyer side after payment (03 §5.3): wait, confirm, complain, or get the refund once due. */
export function BuyerActions({ orderPda, order }: { orderPda: string; order: OrderAccount }) {
  const session = useSession();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const deadline = activeDeadline(order);
  const expired = useExpired(deadline?.at);
  const pda = new PublicKey(orderPda);
  const balanceKey = session.pubkey ? [vaultixKeys.balance(session.pubkey.toBase58())] : [];

  const shipment = useQuery({
    queryKey: ["shipment", orderPda],
    queryFn: () => getShipment(orderPda, session.getAccessToken),
    enabled: order.status === "Shipped" || order.status === "Disputed",
    // Saved right after the dispatch transaction: until it shows up, look again.
    refetchInterval: (query) => (query.state.data ? false : LIVE_POLL_MS),
  });

  if (order.status === "Paid") {
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="Tu plata está en bóveda.">
          {deadline ? (
            <Deadline at={deadline.at}>
              {(d) => (expired ? `El vendedor no despachó a tiempo (${d}).` : `El vendedor tiene hasta el ${d} para despachar.`)}
            </Deadline>
          ) : null}
          {!expired ? <p>Si no lo despacha a tiempo, te devolvemos todo.</p> : null}
        </StateNote>
        {expired ? (
          <TxButton
            fullWidth
            label={`Pedí el reembolso (${formatUsdc(order.amount)})`}
            signer={null}
            successMessage={`Te devolvimos ${formatUsdc(order.amount)}.`}
            invalidate={[vaultixKeys.order(orderPda), ...balanceKey]}
            build={(client) => client.buildRefundUnshippedTx({ order: pda })}
          />
        ) : null}
      </div>
    );
  }

  if (order.status === "Shipped") {
    const site = shipment.data ? CARRIER_SITES[shipment.data.carrier] : undefined;
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="El vendedor ya despachó.">
          {deadline ? (
            <Deadline at={deadline.at}>
              {(d) => (expired ? `Venció el plazo para reclamar (${d}).` : `Podés reclamar hasta el ${d}. Después el pago se libera solo.`)}
            </Deadline>
          ) : null}
          {expired ? <p>Ya no se puede abrir un reclamo: el pago queda para el vendedor.</p> : null}
          <FactBlock label="Seguimiento">
            {shipment.data ? (
              <>
                <span>
                  {CARRIER_LABELS[shipment.data.carrier]}{" "}
                  <span className="font-mono">{shipment.data.trackingNumber}</span>
                </span>
                {site ? (
                  <ButtonAnchor
                    href={site}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    className="mt-2 self-start"
                  >
                    Seguilo en {CARRIER_LABELS[shipment.data.carrier]}
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5L7 9" />
                    </svg>
                    <span className="sr-only">(se abre en otra pestaña)</span>
                  </ButtonAnchor>
                ) : null}
              </>
            ) : (
              <span className="text-steel">El vendedor no cargó un número de seguimiento.</span>
            )}
          </FactBlock>
        </StateNote>
        {!expired ? (
          <>
            <TxButton
              fullWidth
              label="Confirmá que llegó"
              signer={session.pubkey}
              successMessage="Listo: le liberamos el pago al vendedor."
              invalidate={[vaultixKeys.order(orderPda)]}
              build={(client) => client.buildConfirmReceiptTx({ order: pda, buyer: session.pubkey! })}
            />
            <Button fullWidth variant="destructive" onClick={() => setDisputeOpen(true)}>
              Tengo un problema
            </Button>
            <DisputeSheet open={disputeOpen} onClose={() => setDisputeOpen(false)} orderPda={orderPda} order={order} />
          </>
        ) : null}
      </div>
    );
  }

  if (order.status === "Disputed") {
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="Abriste un reclamo.">
          <p>
            Tu plata y tu depósito siguen en bóveda. Subí fotos, videos o una nota que muestren qué pasó. Un árbitro va
            a decidir y te avisamos por mail.
          </p>
        </StateNote>
        <Evidence orderPda={orderPda} sellerPubkey={order.seller.toBase58()} />
      </div>
    );
  }

  return null;
}
