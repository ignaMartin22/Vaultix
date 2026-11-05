import { Amount } from "@/components/Amount";
import { StatusBadge } from "@/components/StatusBadge";
import { shortAddress } from "@/lib/format";
import type { PublicListing } from "@/lib/listings-client";
import type { OrderStatus } from "@/lib/vaultix/contract";

export interface OrderHeaderProps {
  listing: PublicListing;
  status: OrderStatus;
  amount: bigint;
}

/** Fixed content of a link (03 §5.3): photos, product, amount, status, seal and seller. */
export function OrderHeader({ listing, status, amount }: OrderHeaderProps) {
  const { title, description, photoUrls } = listing.listing;
  const { displayName, pubkey, salesCompleted } = listing.seller;

  return (
    <div className="flex flex-col gap-4">
      {photoUrls.length > 0 ? (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
          {photoUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public URLs, sizes unknown
            <img
              key={url}
              src={url}
              alt={i === 0 ? title : `${title}, foto ${i + 1}`}
              className="aspect-square w-[85%] shrink-0 snap-center rounded-2xl bg-graphite object-cover sm:w-80"
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-title font-semibold">{title}</h1>
        <StatusBadge status={status} />
      </div>
      <Amount units={amount} className="text-subtitle" />

      {/* Seal (05 §7). TODO(brand): add the isotype once the SVG is in the repo. */}
      <div className="flex items-center gap-3 rounded-2xl border border-steel/20 bg-graphite p-3">
        <div className="flex flex-col">
          <span className="text-body font-medium text-bone">Pago protegido</span>
          <span className="font-mono text-label text-steel">FONDOS EN BÓVEDA</span>
        </div>
      </div>

      {description ? <p className="whitespace-pre-line text-body text-bone">{description}</p> : null}

      <p className="text-label text-steel">
        Vende {displayName ?? shortAddress(pubkey)} ·{" "}
        {salesCompleted === 0 ? "Todavía sin ventas cerradas" : `${salesCompleted} ${salesCompleted === 1 ? "venta cerrada" : "ventas cerradas"}`}
      </p>
    </div>
  );
}
