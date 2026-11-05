import type { Metadata } from "next";
import { Suspense } from "react";

import { OrderPage } from "@/components/order/OrderPage";

// W-06 replaces this with per-link metadata and the Open Graph image.
export const metadata: Metadata = {
  title: "Pago protegido · Vaultix",
  description: "La plata queda en bóveda hasta que confirmes que llegó.",
};

export default function PaymentLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Suspense fallback={<p className="text-steel">Cargando…</p>}>
        <OrderPage />
      </Suspense>
    </main>
  );
}
