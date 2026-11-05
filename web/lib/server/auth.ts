/**
 * `requireUser(req)`: verifies the Privy access token (`Authorization: Bearer …`),
 * resolves the user's Solana account and upserts `profiles` (specs/02-backend.md §3).
 *
 * The dependencies are injected (`createRequireUser`) so tests can mock Privy
 * and Supabase; routes use the default `requireUser`.
 */
import { PrivyClient, type LinkedAccount, type User } from "@privy-io/node";

import { serverEnv } from "./env";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";

export interface AuthUser {
  privyUserId: string;
  /** The Solana account this user signs with (base58). */
  pubkey: string;
  /** Every Solana account linked to the user, for signer checks. */
  solanaPubkeys: string[];
  email: string | null;
}

export interface ProfileUpsert {
  privy_user_id: string;
  wallet_pubkey: string;
  email?: string;
}

export interface AuthDeps {
  /** Resolves the Privy user id, or throws if the token is invalid or expired. */
  verifyAccessToken(token: string): Promise<{ user_id: string }>;
  getUser(userId: string): Promise<Pick<User, "id" | "linked_accounts">>;
  upsertProfile(profile: ProfileUpsert): Promise<void>;
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) throw new ApiError("unauthorized");
  return match[1];
}

type SolanaWallet = Extract<LinkedAccount, { type: "wallet"; chain_type: "solana" }>;

function isSolanaWallet(account: LinkedAccount): account is SolanaWallet {
  return account.type === "wallet" && "chain_type" in account && account.chain_type === "solana";
}

function isEmbedded(wallet: SolanaWallet): boolean {
  return "connector_type" in wallet && wallet.connector_type === "embedded";
}

/**
 * External account (Phantom, Solflare) first: if the user connected one, that's
 * the account they chose to use. Otherwise the Privy embedded one.
 */
export function pickSolanaPubkey(accounts: readonly LinkedAccount[]): {
  pubkey: string | null;
  all: string[];
} {
  const wallets = accounts.filter(isSolanaWallet);
  const preferred = wallets.find((w) => !isEmbedded(w)) ?? wallets.find(isEmbedded);
  return { pubkey: preferred?.address ?? null, all: wallets.map((w) => w.address) };
}

export function pickEmail(accounts: readonly LinkedAccount[]): string | null {
  for (const account of accounts) {
    if (account.type === "email") return account.address;
  }
  for (const account of accounts) {
    if (account.type === "google_oauth") return account.email;
  }
  return null;
}

export function createRequireUser(deps: AuthDeps) {
  return async function requireUser(req: Request): Promise<AuthUser> {
    const token = bearerToken(req);

    let userId: string;
    try {
      ({ user_id: userId } = await deps.verifyAccessToken(token));
    } catch (err) {
      throw new ApiError("unauthorized", undefined, { cause: err });
    }

    const user = await deps.getUser(userId);
    const { pubkey, all } = pickSolanaPubkey(user.linked_accounts);
    // The embedded account can take a moment to exist right after sign-up.
    if (!pubkey) throw new ApiError("no_wallet");
    const email = pickEmail(user.linked_accounts);

    await deps.upsertProfile({
      privy_user_id: userId,
      wallet_pubkey: pubkey,
      ...(email ? { email } : {}),
    });

    return { privyUserId: userId, pubkey, solanaPubkeys: all, email };
  };
}

function defaultDeps(): AuthDeps {
  const env = serverEnv();
  const privy = new PrivyClient({ appId: env.privyAppId, appSecret: env.privyAppSecret });
  return {
    verifyAccessToken: (token) => privy.utils().auth().verifyAccessToken(token),
    getUser: (userId) => privy.users()._get(userId),
    async upsertProfile(profile) {
      const { error } = await supabaseAdmin()
        .from("profiles")
        .upsert(profile, { onConflict: "privy_user_id" });
      if (error) throw new Error(`profiles upsert failed: ${error.message}`, { cause: error });
    },
  };
}

let defaultRequireUser: ReturnType<typeof createRequireUser> | undefined;

export async function requireUser(req: Request): Promise<AuthUser> {
  // Touch the request before building clients: it marks the route as
  // request-time for prerendering and rejects anonymous calls cheaply.
  bearerToken(req);
  defaultRequireUser ??= createRequireUser(defaultDeps());
  return defaultRequireUser(req);
}
