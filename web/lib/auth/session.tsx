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

import { PRIVY_SOLANA_CHAIN } from "@/lib/solana-network";

import { describeIdentity, type Identity, type LinkedAccount } from "./identity";
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
  /** How they signed in (Google, email, Phantom…); null when unknown or signed out. */
  identity?: Identity | null;
  /** True for the local test session (no Privy). */
  mock: boolean;
  /** Mock only: swaps between two test accounts, to play seller and buyer in one tab. */
  switchTestAccount?: () => void;
  /** Mock only: which test account is active (0 or 1). */
  testAccount?: number;
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
  const identity = useMemo(
    () => (authenticated ? describeIdentity((user?.linkedAccounts ?? []) as LinkedAccount[]) : null),
    [authenticated, user],
  );
  const session = useMemo<Session>(
    () => ({
      ready,
      authenticated,
      pubkey: address ? new PublicKey(address) : null,
      identity,
      login: () => login(),
      logout,
      getAccessToken,
      async signTransaction(tx) {
        const wallet = wallets.find((w) => w.address === address);
        if (!wallet) throw new Error("No encontramos tu cuenta para firmar. Volvé a entrar.");
        const { signedTransaction } = await signTransaction({
          transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
          wallet,
          chain: PRIVY_SOLANA_CHAIN,
          // Same as the global setting, per call so the dashboard can't turn it back on.
          options: { uiOptions: { showWalletUIs: false } },
        });
        return Transaction.from(signedTransaction);
      },
      mock: false,
    }),
    [ready, authenticated, address, identity, login, logout, getAccessToken, wallets, signTransaction],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

const MOCK_KEY = "vaultix:mock-accounts";

/** Two throwaway test accounts per tab (seller and buyer), kept across reloads of the tab. */
function loadMockKeypairs(): [Keypair, Keypair] {
  try {
    const stored = window.sessionStorage.getItem(MOCK_KEY);
    if (stored) {
      const [a, b] = JSON.parse(stored) as number[][];
      return [Keypair.fromSecretKey(Uint8Array.from(a)), Keypair.fromSecretKey(Uint8Array.from(b))];
    }
    const fresh: [Keypair, Keypair] = [Keypair.generate(), Keypair.generate()];
    window.sessionStorage.setItem(MOCK_KEY, JSON.stringify(fresh.map((k) => [...k.secretKey])));
    return fresh;
  } catch {
    return [Keypair.generate(), Keypair.generate()];
  }
}

/** Mock mode only: local test accounts. Never hold real funds. */
export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<[Keypair, Keypair] | null>(null);
  const [active, setActive] = useState(0);
  const keypair = accounts ? accounts[active] : null;

  const login = useCallback(() => setAccounts(loadMockKeypairs()), []);
  const switchTestAccount = useCallback(() => {
    setAccounts((current) => current ?? loadMockKeypairs());
    setActive((i) => 1 - i);
  }, []);
  const session = useMemo<Session>(
    () => ({
      ready: true,
      authenticated: keypair !== null,
      pubkey: keypair?.publicKey ?? null,
      login,
      logout: async () => setAccounts(null),
      getAccessToken: async () => null,
      async signTransaction(tx) {
        if (!keypair) throw new Error("No hay una sesión abierta.");
        tx.partialSign(keypair);
        return tx;
      },
      mock: true,
      switchTestAccount,
      testAccount: active,
    }),
    [keypair, login, switchTestAccount, active],
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
