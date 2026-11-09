"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import {
  MockSessionProvider,
  PrivySessionProvider,
  UnconfiguredSessionProvider,
} from "@/lib/auth/session";
import { PRIVY_SOLANA_CHAIN, RPC_URL, RPC_WS_URL } from "@/lib/solana-network";
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
    // No Privy confirmation screens for the embedded wallet ("pago de 0 USDC"):
    // Vaultix already shows what each action does and its state. External
    // wallets (Phantom) keep their own approval, which Privy doesn't control.
    showWalletUIs: false,
  },
  externalWallets: {
    solana: { connectors: toSolanaWalletConnectors() },
  },
  // Privy needs an RPC for the chain it signs on (devnet here); without it,
  // signing fails with "No RPC configuration found for chain solana:mainnet".
  solana: {
    rpcs: {
      [PRIVY_SOLANA_CHAIN]: {
        rpc: createSolanaRpc(RPC_URL),
        rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS_URL),
      },
    },
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
