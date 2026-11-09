import type { Metadata } from "next";

import { AccountPage } from "@/components/account/AccountPage";

export const metadata: Metadata = { title: "Tu cuenta · Vaultix" };

export default function YourAccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <AccountPage />
    </main>
  );
}
