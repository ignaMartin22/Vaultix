import type { ReactNode } from "react";

import { LogoIsotype } from "@/components/Logo";

export interface LinkPreviewProps {
  title: string;
  /** Already formatted: "USDC 120.00". */
  amount: string | null;
  /** Optional line under the amount (a pesos reference). */
  amountNote?: ReactNode;
  photoUrl?: string | null;
  /** What the shared link shows as its address. */
  address: string;
  className?: string;
}

/**
 * How a payment link looks when it's shared (05 §9): brand, the "Pago
 * protegido" seal, product, amount and a recognizable Vaultix address.
 * Without a photo the card is built to stand on its own: the seal leads,
 * the product and the amount carry it. No empty image frame.
 */
export function LinkPreview({
  title,
  amount,
  amountNote,
  photoUrl,
  address,
  className = "",
}: LinkPreviewProps) {
  const seal = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-label uppercase text-bone">
      <LogoIsotype size={16} />
      Pago protegido
    </span>
  );

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-steel/20 bg-graphite ${className}`}
    >
      {photoUrl ? (
        <div className="relative aspect-[1.91/1] bg-vault-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- local previews and listing photos, sizes unknown */}
          <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-md bg-vault-black/85 py-1 pl-1.5 pr-2.5">
            {seal}
          </span>
        </div>
      ) : (
        <div className="border-b border-steel/15 bg-vault-black px-4 py-3">{seal}</div>
      )}
      <div className="flex flex-col gap-1 p-4">
        <span className="truncate text-body font-medium text-bone">{title || "Tu producto"}</span>
        <span
          className={`font-mono tabular-nums text-bone ${photoUrl ? "text-body" : "text-title"}`}
        >
          {amount ?? "USDC —"}
        </span>
        {amountNote ? <span className="text-label text-steel">{amountNote}</span> : null}
        <span className="mt-1 truncate font-mono text-label text-steel">{address}</span>
      </div>
    </article>
  );
}
