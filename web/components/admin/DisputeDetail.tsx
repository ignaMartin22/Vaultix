"use client";

import { Card } from "@/components/ui/Card";
import { formatAmount, formatUsdc } from "@/lib/amounts";
import type { AdminDispute } from "@/lib/admin-client";
import { formatDeadline } from "@/lib/deadlines";
import { shortAddress } from "@/lib/format";
import { CARRIER_LABELS, isCarrier } from "@/lib/tracking";

import { ResolvePanel } from "./ResolvePanel";

/** One dispute: product (hash-checked), shipping, timeline, both sides' evidence, and the decision. */
export function DisputeDetail({ dispute, onResolved }: { dispute: AdminDispute; onResolved: () => void }) {
  const { order, listing, shipment, shipping, evidence } = dispute;
  const amount = BigInt(order.amountUnits);
  const deposit = BigInt(order.disputeDepositUnits);
  const who = (pubkey: string) =>
    pubkey === order.seller ? "Vendedor" : pubkey === order.buyer ? "Comprador" : shortAddress(pubkey);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-title font-semibold">{listing?.title ?? "Producto sin publicación"}</h2>
          <span className="font-mono text-bone">{formatUsdc(amount)}</span>
        </div>
        {listing ? (
          <>
            <p className={`text-label ${listing.verified ? "text-released" : "text-plasma"}`}>
              {listing.verified
                ? "La publicación coincide con la que vio el comprador al pagar."
                : "Ojo: la publicación no coincide con la que se pagó."}
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {listing.photoUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- public listing photos
                <img key={url} src={url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
            {listing.description ? <p className="whitespace-pre-line text-body text-steel">{listing.description}</p> : null}
          </>
        ) : null}
        <p className="text-label text-steel">
          Vendedor {shortAddress(order.seller)} · Comprador {order.buyer ? shortAddress(order.buyer) : "—"} · Depósito{" "}
          {formatAmount(deposit)} USDC
        </p>
      </Card>

      <Card className="flex flex-col gap-1 text-body">
        <span className="text-label text-steel">Tiempos y envío</span>
        {order.paidAt > 0 ? <span>Pagado: {formatDeadline(BigInt(order.paidAt))}</span> : null}
        {order.shippedAt > 0 ? <span>Despachado: {formatDeadline(BigInt(order.shippedAt))}</span> : null}
        <span>
          Seguimiento:{" "}
          {shipment
            ? `${isCarrier(shipment.carrier) ? CARRIER_LABELS[shipment.carrier] : shipment.carrier} ${shipment.tracking_number}`
            : "sin número"}
          {order.trackingHash ? <span className="text-steel"> (registrado al despachar)</span> : null}
        </span>
        {shipping ? (
          <span className="text-steel">
            Envío a {shipping.full_name}, {shipping.street}, {shipping.city} ({shipping.postal_code}), {shipping.province}
          </span>
        ) : null}
      </Card>

      <section className="flex flex-col gap-2">
        <h3 className="text-subtitle font-semibold">Evidencia</h3>
        {evidence.length === 0 ? <p className="text-steel">Ninguna de las partes subió evidencia todavía.</p> : null}
        {evidence.map((item) => (
          <Card key={item.id} className="flex flex-col gap-2">
            <span className="text-label text-steel">
              {who(item.uploader)} · {new Date(item.createdAt).toLocaleString("es-AR")}
            </span>
            {item.kind === "photo" && item.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img src={item.url} alt="Evidencia" className="max-h-72 rounded-xl object-contain" />
            ) : null}
            {item.kind === "video" && item.url ? <video src={item.url} controls className="max-h-72 rounded-xl" /> : null}
            {item.note ? <p className="whitespace-pre-line text-body">{item.note}</p> : null}
          </Card>
        ))}
      </section>

      <ResolvePanel
        orderPda={dispute.orderPda}
        amount={amount}
        feeBps={order.feeBps}
        deposit={deposit}
        onResolved={onResolved}
      />
    </div>
  );
}
