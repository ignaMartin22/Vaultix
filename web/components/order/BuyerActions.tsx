"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { activeDeadline, deadlineState, nowSecs } from "@/lib/deadlines";
import { getShipment } from "@/lib/order-client";
import { CARRIER_LABELS, CARRIER_SITES } from "@/lib/tracking";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { Deadline } from "./Deadline";
import { DisputeSheet } from "./DisputeSheet";
import { Evidence } from "./EvidenceSheet";

/** Buyer side after payment (03 §5.3): wait, confirm, complain, or get the refund once due. */
export function BuyerActions({ orderPda, order }: { orderPda: string; order: OrderAccount }) {
  const session = useSession();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const deadline = activeDeadline(order);
  const expired = deadline ? deadlineState(deadline.at, nowSecs()).expired : false;
  const pda = new PublicKey(orderPda);
  const balanceKey = session.pubkey ? [vaultixKeys.balance(session.pubkey.toBase58())] : [];

  const shipment = useQuery({
    queryKey: ["shipment", orderPda],
    queryFn: () => getShipment(orderPda, session.getAccessToken),
    enabled: order.status === "Shipped" || order.status === "Disputed",
  });

  if (order.status === "Paid") {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <span className="text-subtitle font-semibold">Tu plata está en bóveda.</span>
          {deadline ? (
            <Deadline at={deadline.at}>
              {(d) => (expired ? `El vendedor no despachó a tiempo (${d}).` : `El vendedor tiene hasta el ${d} para despachar.`)}
            </Deadline>
          ) : null}
          {!expired ? (
            <span className="text-body text-steel">Si no lo despacha a tiempo, te devolvemos todo.</span>
          ) : null}
        </Card>
        {expired ? (
          <TxButton
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
        <Card className="flex flex-col gap-2">
          <span className="text-subtitle font-semibold">El vendedor ya despachó.</span>
          {shipment.data ? (
            <span className="text-body text-bone">
              Seguimiento: {CARRIER_LABELS[shipment.data.carrier]} {shipment.data.trackingNumber}
              {site ? (
                <>
                  {" · "}
                  <a href={site} target="_blank" rel="noopener noreferrer" className="text-ion-blue underline">
                    Seguilo en {CARRIER_LABELS[shipment.data.carrier]}
                  </a>
                </>
              ) : null}
            </span>
          ) : (
            <span className="text-body text-steel">El vendedor no cargó un número de seguimiento.</span>
          )}
          {deadline ? (
            <Deadline at={deadline.at}>
              {(d) => (expired ? `Venció el plazo para reclamar (${d}).` : `Podés reclamar hasta el ${d}. Después el pago se libera solo.`)}
            </Deadline>
          ) : null}
        </Card>
        {!expired ? (
          <>
            <TxButton
              label="Confirmá que llegó"
              signer={session.pubkey}
              successMessage="Listo: le liberamos el pago al vendedor."
              invalidate={[vaultixKeys.order(orderPda)]}
              build={(client) => client.buildConfirmReceiptTx({ order: pda, buyer: session.pubkey! })}
            />
            <Button variant="destructive" onClick={() => setDisputeOpen(true)}>
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
        <Card className="flex flex-col gap-1">
          <span className="text-subtitle font-semibold">Abriste un reclamo.</span>
          <span className="text-body text-steel">
            Tu plata y tu depósito siguen en bóveda. Subí fotos, videos o una nota que muestren qué pasó. Un árbitro va
            a decidir y te avisamos por mail.
          </span>
        </Card>
        <Evidence orderPda={orderPda} sellerPubkey={order.seller.toBase58()} />
      </div>
    );
  }

  return null;
}
