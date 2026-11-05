"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google", "wallet"],
  appearance: {
    theme: "dark",
    walletChainType: "solana-only",
  },
  embeddedWallets: {
    solana: { createOnLogin: "users-without-wallets" },
  },
  externalWallets: {
    solana: { connectors: toSolanaWalletConnectors() },
  },
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const content = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  if (!privyAppId) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("NEXT_PUBLIC_PRIVY_APP_ID is not set: rendering without Privy.");
    }
    return content;
  }

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      {content}
    </PrivyProvider>
  );
}
