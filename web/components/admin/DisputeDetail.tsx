"use client";

import { formatAmount, formatUsdc } from "@/lib/amounts";
import type { AdminDispute } from "@/lib/admin-client";
import { formatDeadline } from "@/lib/deadlines";
import { shortAddress } from "@/lib/format";
import { CARRIER_LABELS, isCarrier } from "@/lib/tracking";

import { ResolvePanel } from "./ResolvePanel";

type EvidenceItem = AdminDispute["evidence"][number];

function EvidenceColumn({ title, items }: { title: string; items: EvidenceItem[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h4 className="flex items-baseline justify-between gap-2 font-mono text-label uppercase text-steel">
        {title}
        <span>{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-steel/20 p-4 text-body text-steel">Sin evidencia todavía.</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 border-t border-steel/15 py-3">
              <span className="font-mono text-label text-steel">{new Date(item.createdAt).toLocaleString("es-AR")}</span>
              {item.kind === "photo" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                <img src={item.url} alt="Evidencia" className="max-h-72 self-start rounded-xl bg-graphite object-contain" />
              ) : null}
              {item.kind === "video" && item.url ? (
                <video src={item.url} controls className="max-h-72 self-start rounded-xl bg-graphite" />
              ) : null}
              {item.note ? <p className="whitespace-pre-line text-body text-bone">{item.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One dispute: product (hash-checked), shipping, timeline, both sides' evidence, and the decision. */
export function DisputeDetail({ dispute, onResolved }: { dispute: AdminDispute; onResolved: () => void }) {
  const { order, listing, shipment, shipping, evidence } = dispute;
  const amount = BigInt(order.amountUnits);
  const deposit = BigInt(order.disputeDepositUnits);
  // Neutral by layout: the same column, the same weight, for each side.
  const fromSeller = evidence.filter((e) => e.uploader === order.seller);
  const fromBuyer = evidence.filter((e) => e.uploader === order.buyer);
  const fromOthers = evidence.filter((e) => e.uploader !== order.seller && e.uploader !== order.buyer);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-title text-bone text-balance sm:text-title-lg">
            {listing?.title ?? "Producto sin publicación"}
          </h2>
          <span className="font-mono text-title tabular-nums text-bone">{formatUsdc(amount)}</span>
        </div>
        {listing ? (
          <>
            <p className={`flex items-start gap-2 text-body ${listing.verified ? "text-bone" : "text-ember"}`}>
              <span
                aria-hidden="true"
                className={`mt-2 size-1.5 shrink-0 rotate-45 ${listing.verified ? "bg-released" : "bg-ember"}`}
              />
              {listing.verified
                ? "La publicación coincide con la que vio el comprador al pagar."
                : "Ojo: la publicación no coincide con la que se pagó."}
            </p>
            {listing.photoUrls.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto">
                {listing.photoUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- public listing photos
                  <img key={url} src={url} alt="" className="size-24 shrink-0 rounded-xl bg-graphite object-cover" />
                ))}
              </div>
            ) : null}
            {listing.description ? <p className="whitespace-pre-line text-body text-steel">{listing.description}</p> : null}
          </>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-steel/15 pt-5 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-label uppercase text-steel">Vendedor</dt>
            <dd className="font-mono text-body text-bone">{shortAddress(order.seller)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-label uppercase text-steel">Comprador</dt>
            <dd className="font-mono text-body text-bone">{order.buyer ? shortAddress(order.buyer) : "—"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-label uppercase text-steel">Depósito</dt>
            <dd className="font-mono text-body text-bone">{formatAmount(deposit)} USDC</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-label uppercase text-steel">Seguimiento</dt>
            <dd className="text-body text-bone">
              {shipment ? (
                <>
                  {isCarrier(shipment.carrier) ? CARRIER_LABELS[shipment.carrier] : shipment.carrier}{" "}
                  <span className="font-mono">{shipment.tracking_number}</span>
                </>
              ) : (
                "Sin número"
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1 text-body text-steel">
          {order.paidAt > 0 ? <span>Pagado: {formatDeadline(BigInt(order.paidAt))}</span> : null}
          {order.shippedAt > 0 ? <span>Despachado: {formatDeadline(BigInt(order.shippedAt))}</span> : null}
          {order.trackingHash ? <span>El seguimiento quedó registrado al despachar.</span> : null}
          {shipping ? (
            <span>
              Envío a {shipping.full_name}, {shipping.street}, {shipping.city} ({shipping.postal_code}), {shipping.province}
            </span>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="admin-evidence" className="flex flex-col gap-5">
        <h3 id="admin-evidence" className="font-display text-title text-bone">
          Evidencia
        </h3>
        <div className="grid gap-8 md:grid-cols-2">
          <EvidenceColumn title="Comprador" items={fromBuyer} />
          <EvidenceColumn title="Vendedor" items={fromSeller} />
        </div>
        {fromOthers.length > 0 ? <EvidenceColumn title="Otras cuentas" items={fromOthers} /> : null}
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
