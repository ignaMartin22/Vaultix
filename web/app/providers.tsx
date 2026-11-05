"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import {
  MockSessionProvider,
  PrivySessionProvider,
  UnconfiguredSessionProvider,
} from "@/lib/auth/session";
import { USE_MOCK } from "@/lib/vaultix/mode";

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

  useEffect(() => {
    // Once, in the browser: the server would log it on every render.
    if (!privyAppId && process.env.NODE_ENV !== "production") {
      console.warn("NEXT_PUBLIC_PRIVY_APP_ID is not set: using a local test session.");
    }
  }, []);

  const content = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  if (privyAppId) {
    return (
      <PrivyProvider appId={privyAppId} config={privyConfig}>
        <PrivySessionProvider>{content}</PrivySessionProvider>
      </PrivyProvider>
    );
  }

  // Without Privy: a local test account in mock mode, signed out otherwise.
  return USE_MOCK ? (
    <MockSessionProvider>{content}</MockSessionProvider>
  ) : (
    <UnconfiguredSessionProvider>{content}</UnconfiguredSessionProvider>
  );
}
