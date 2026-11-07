import type { Metadata } from "next";

import { OrdersPage } from "@/components/orders/OrdersPage";

export const metadata: Metadata = { title: "Mis operaciones · Vaultix" };

export default function MyOrdersPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <OrdersPage />
    </main>
  );
}
