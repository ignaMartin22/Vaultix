import type { Metadata } from "next";

import { DisputesPanel } from "@/components/admin/DisputesPanel";

export const metadata: Metadata = {
  title: "Reclamos · Vaultix",
  robots: { index: false, follow: false },
};

export default function AdminDisputesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <DisputesPanel />
    </main>
  );
}
