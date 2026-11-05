import type { Metadata } from "next";

import { OrdersPage } from "@/components/orders/OrdersPage";

export const metadata: Metadata = { title: "Mis compras y ventas · Vaultix" };

export default function MyOrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8">
      <OrdersPage />
    </main>
  );
}
