import type { Metadata } from "next";
import { Suspense } from "react";

import { OrderPage } from "@/components/order/OrderPage";
import { formatUsdc } from "@/lib/amounts";
import { listingMeta } from "@/lib/server/listing-meta";

const GENERIC: Metadata = {
  title: "Pago protegido · Vaultix",
  description: "La plata queda en bóveda hasta que confirmes que llegó.",
};

/** 03 §5.4: "{producto} — Pago protegido con Vaultix" when the link exists. */
export async function generateMetadata({ params }: { params: Promise<{ orderId: string }> }): Promise<Metadata> {
  const { orderId } = await params;
  const meta = await listingMeta(orderId);
  if (!meta) return GENERIC;
  const title = `${meta.title} — Pago protegido con Vaultix`;
  const description = `${formatUsdc(BigInt(meta.amountUnits))}. La plata queda en bóveda hasta que te llega.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function PaymentLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Suspense fallback={<p className="text-steel">Cargando…</p>}>
        <OrderPage />
      </Suspense>
    </main>
  );
}
