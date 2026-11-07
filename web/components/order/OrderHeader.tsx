"use client";

import { useState } from "react";

import { Amount } from "@/components/Amount";
import { ProtectedSeal } from "@/components/ProtectedSeal";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddress } from "@/lib/format";
import type { PublicListing } from "@/lib/listings-client";
import type { OrderStatus } from "@/lib/vaultix/contract";

/** The seal's line says only what's true for this link right now. */
function sealLine(status: OrderStatus): string {
  if (status === "Created") return "La plata queda en bóveda";
  if (status === "Paid" || status === "Shipped" || status === "Disputed") return "Fondos en bóveda";
  return "Operación cerrada";
}

/** Photos: one large, the rest as thumbnails; a swipeable strip on mobile. */
export function OrderGallery({ listing }: { listing: PublicListing }) {
  const { title, photoUrls } = listing.listing;
  const [active, setActive] = useState(0);
  if (photoUrls.length === 0) return null;
  const main = photoUrls[Math.min(active, photoUrls.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile: snap strip. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:hidden">
        {photoUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URLs, sizes unknown
          <img
            key={url}
            src={url}
            alt={i === 0 ? title : `${title}, foto ${i + 1}`}
            className="aspect-square w-[85%] shrink-0 snap-center rounded-2xl bg-graphite object-cover"
          />
        ))}
      </div>
      {/* sm+: main photo and thumbnails. */}
      <div className="hidden flex-col gap-3 sm:flex">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URLs, sizes unknown */}
        <img
          src={main}
          alt={active === 0 ? title : `${title}, foto ${active + 1}`}
          className="aspect-[4/3] w-full rounded-2xl bg-graphite object-cover"
        />
        {photoUrls.length > 1 ? (
          <div className="flex gap-3">
            {photoUrls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-pressed={i === active}
                className={`size-20 overflow-hidden rounded-xl border-2 transition-colors ${
                  i === active ? "border-bone" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of the same URLs */}
                <img src={url} alt="" className="h-full w-full bg-graphite object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface OrderSummaryProps {
  orderPda: string;
  listing: PublicListing;
  status: OrderStatus;
  amount: bigint;
}

/** Reference, status, product, amount and the seal: the facts a link commits to (05 §9). */
export function OrderSummary({ orderPda, listing, status, amount }: OrderSummaryProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        {/* No uppercase: the reference is case-sensitive and must match the link. */}
        <span className="font-mono text-label text-steel">Pedido {shortAddress(orderPda)}</span>
        <StatusBadge status={status} />
      </div>
      <h1 className="font-display text-title text-bone text-balance sm:text-title-lg">
        {listing.listing.title}
      </h1>
      <Amount units={amount} size="lg" />
      <ProtectedSeal line={sealLine(status)} className="self-start" />
    </div>
  );
}

/** Description and who sells, with their track record. */
export function OrderAbout({ listing }: { listing: PublicListing }) {
  const { description } = listing.listing;
  const { displayName, pubkey, salesCompleted } = listing.seller;

  return (
    <div className="flex flex-col gap-4">
      {description ? (
        <p className="whitespace-pre-line text-body text-bone text-pretty">{description}</p>
      ) : null}
      <dl className="flex flex-col gap-1 border-t border-steel/15 pt-4">
        <dt className="font-mono text-label uppercase text-steel">Vende</dt>
        <dd className="text-body text-bone">
          {displayName ?? <span className="font-mono">{shortAddress(pubkey)}</span>}
          <span className="text-steel">
            {" · "}
            {salesCompleted === 0
              ? "Todavía sin ventas cerradas"
              : `${salesCompleted} ${salesCompleted === 1 ? "venta cerrada" : "ventas cerradas"}`}
          </span>
        </dd>
      </dl>
    </div>
  );
}
