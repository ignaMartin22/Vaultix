import type { Metadata } from "next";

import { DisputesPanel } from "@/components/admin/DisputesPanel";

export const metadata: Metadata = {
  title: "Reclamos · Vaultix",
  robots: { index: false, follow: false },
};

export default function AdminDisputesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <DisputesPanel />
    </main>
  );
}
