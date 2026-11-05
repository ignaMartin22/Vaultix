"use client";

/**
 * One session API for the whole app: who is signed in, which account signs,
 * the API token and transaction signing. Backed by Privy when it's configured;
 * in mock mode without Privy, by a local test account so screens can be tried
 * without any secret.
 */
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { pickSolanaAddress, type LinkedWallet } from "./pick-account";

export interface Session {
  ready: boolean;
  authenticated: boolean;
  /** The account that signs (external first, else the embedded one). */
  pubkey: PublicKey | null;
  login(): void;
  logout(): Promise<void>;
  /** Bearer token for `/api`; null in mock mode or when signed out. */
  getAccessToken(): Promise<string | null>;
  /** Adds the user's signature, leaving other slots (the fee payer) empty. */
  signTransaction(tx: Transaction): Promise<Transaction>;
  /** True for the local test session (no Privy). */
  mock: boolean;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a session provider");
  return session;
}

export function PrivySessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const address = pickSolanaAddress((user?.linkedAccounts ?? []) as LinkedWallet[]);
  const session = useMemo<Session>(
    () => ({
      ready,
      authenticated,
      pubkey: address ? new PublicKey(address) : null,
      login: () => login(),
      logout,
      getAccessToken,
      async signTransaction(tx) {
        const wallet = wallets.find((w) => w.address === address);
        if (!wallet) throw new Error("No encontramos tu cuenta para firmar. Volvé a entrar.");
        const { signedTransaction } = await signTransaction({
          transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
          wallet,
        });
        return Transaction.from(signedTransaction);
      },
      mock: false,
    }),
    [ready, authenticated, address, login, logout, getAccessToken, wallets, signTransaction],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

const MOCK_KEY = "vaultix:mock-account";

function loadMockKeypair(): Keypair {
  try {
    const stored = window.sessionStorage.getItem(MOCK_KEY);
    if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
    const fresh = Keypair.generate();
    window.sessionStorage.setItem(MOCK_KEY, JSON.stringify([...fresh.secretKey]));
    return fresh;
  } catch {
    return Keypair.generate();
  }
}

/** Mock mode only: a throwaway account per browser tab. Never holds real funds. */
export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [keypair, setKeypair] = useState<Keypair | null>(null);

  const login = useCallback(() => setKeypair(loadMockKeypair()), []);
  const session = useMemo<Session>(
    () => ({
      ready: true,
      authenticated: keypair !== null,
      pubkey: keypair?.publicKey ?? null,
      login,
      // Logging out forgets the test account: the next login is a different person.
      logout: async () => {
        try {
          window.sessionStorage.removeItem(MOCK_KEY);
        } catch {}
        setKeypair(null);
      },
      getAccessToken: async () => null,
      async signTransaction(tx) {
        if (!keypair) throw new Error("No hay una sesión abierta.");
        tx.partialSign(keypair);
        return tx;
      },
      mock: true,
    }),
    [keypair, login],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Neither Privy nor mock: signed out, and login explains why. */
export function UnconfiguredSessionProvider({ children }: { children: ReactNode }) {
  const session = useMemo<Session>(
    () => ({
      ready: true,
      authenticated: false,
      pubkey: null,
      login: () => console.error("NEXT_PUBLIC_PRIVY_APP_ID is not set: login is unavailable."),
      logout: async () => {},
      getAccessToken: async () => null,
      signTransaction: async () => {
        throw new Error("Login is unavailable");
      },
      mock: false,
    }),
    [],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
