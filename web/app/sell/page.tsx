import type { Metadata } from "next";

import { SellFlow } from "@/components/sell/SellFlow";

export const metadata: Metadata = {
  title: "Creá tu link de pago · Vaultix",
};

export default function SellPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8">
      <SellFlow />
    </main>
  );
}
