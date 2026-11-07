import type { Metadata } from "next";

import { SellFlow } from "@/components/sell/SellFlow";

export const metadata: Metadata = {
  title: "Creá tu link de pago · Vaultix",
};

export default function SellPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <SellFlow />
    </main>
  );
}
