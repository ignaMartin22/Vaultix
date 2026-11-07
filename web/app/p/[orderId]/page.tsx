import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { OrderPage } from "@/components/order/OrderPage";
import { Loading } from "@/components/ui/Feedback";
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

/** Every link is its own page: mark it request-time so its metadata isn't treated as prerenderable. */
async function RequestTime() {
  await connection();
  return null;
}

export default function PaymentLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Suspense fallback={null}>
        <RequestTime />
      </Suspense>
      <Suspense fallback={<Loading label="Abriendo el link…" className="py-10" />}>
        <OrderPage />
      </Suspense>
    </main>
  );
}
