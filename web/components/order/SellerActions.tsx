"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";

import { TxButton } from "@/components/TxButton";
import { useSession } from "@/lib/auth/session";
import { activeDeadline, deadlineState, nowSecs } from "@/lib/deadlines";
import { formatUsdc } from "@/lib/amounts";
import { computeReleaseSplit } from "@/lib/fees";
import { getBuyerAddress, getShipment } from "@/lib/order-client";
import { CARRIER_LABELS } from "@/lib/tracking";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { Deadline } from "./Deadline";
import { Evidence } from "./EvidenceSheet";
import { ShipForm } from "./ShipForm";
import { FactBlock, StateNote } from "./StateNote";

/** Seller side after payment (03 §5.3): ship, wait for release, or release once it's due. */
export function SellerActions({ orderPda, order }: { orderPda: string; order: OrderAccount }) {
  const session = useSession();
  const deadline = activeDeadline(order);
  const expired = deadline ? deadlineState(deadline.at, nowSecs()).expired : false;
  const { sellerNet } = computeReleaseSplit(order.amount, order.feeBps);

  const address = useQuery({
    queryKey: ["buyer-address", orderPda],
    queryFn: () => getBuyerAddress(orderPda, session.getAccessToken),
    enabled: order.status === "Paid",
  });
  const shipment = useQuery({
    queryKey: ["shipment", orderPda],
    queryFn: () => getShipment(orderPda, session.getAccessToken),
    enabled: order.status === "Shipped",
  });

  if (order.status === "Paid") {
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="Te pagaron. La plata está en bóveda.">
          {deadline ? (
            <Deadline at={deadline.at}>{(d) => (expired ? `Venció el plazo para despachar (${d}).` : `Despachá antes del ${d}.`)}</Deadline>
          ) : null}
          {expired ? (
            <p>El comprador ya puede pedir el reembolso. Si todavía no lo pidió, despachá cuanto antes.</p>
          ) : null}
          <FactBlock label="Mandalo a">
            {address.data ? (
              <>
                <span className="font-medium">{address.data.fullName}</span>
                <span>
                  {address.data.street}, {address.data.city} ({address.data.postalCode}), {address.data.province}
                </span>
                <span>
                  Tel.: <span className="font-mono">{address.data.phone}</span>
                </span>
                {address.data.notes ? <span className="text-steel">{address.data.notes}</span> : null}
              </>
            ) : (
              <span className="text-steel">
                {address.isPending ? "Cargando…" : "El comprador todavía no cargó sus datos de envío."}
              </span>
            )}
          </FactBlock>
        </StateNote>

        <ShipForm orderPda={orderPda} />
      </div>
    );
  }

  if (order.status === "Shipped") {
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="Lo despachaste.">
          {deadline ? (
            <Deadline at={deadline.at}>
              {(d) => (expired ? `Ya podés cobrar: el plazo de reclamo venció (${d}).` : `Tu pago se libera el ${d}, o antes si el comprador confirma.`)}
            </Deadline>
          ) : null}
          <p>
            Vas a recibir <span className="font-mono text-bone">{formatUsdc(sellerNet)}</span>.
          </p>
          {shipment.data ? (
            <FactBlock label="Seguimiento">
              <span>
                {CARRIER_LABELS[shipment.data.carrier]} <span className="font-mono">{shipment.data.trackingNumber}</span>
              </span>
            </FactBlock>
          ) : null}
        </StateNote>
        {expired ? (
          <TxButton
            fullWidth
            label="Liberá el pago"
            signer={null}
            successMessage={`Listo: cobraste ${formatUsdc(sellerNet)}.`}
            invalidate={[vaultixKeys.order(orderPda)]}
            build={(client) => client.buildReleaseTx({ order: new PublicKey(orderPda) })}
          />
        ) : null}
      </div>
    );
  }

  if (order.status === "Disputed") {
    return (
      <div className="flex flex-col gap-4">
        <StateNote title="El comprador abrió un reclamo.">
          <p>
            La plata sigue en bóveda. Subí lo que muestre que lo mandaste bien: fotos del paquete, el comprobante del
            correo, la conversación. Un árbitro va a decidir.
          </p>
        </StateNote>
        <Evidence orderPda={orderPda} sellerPubkey={order.seller.toBase58()} />
      </div>
    );
  }

  return null;
}
