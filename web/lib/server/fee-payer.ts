/**
 * The devnet fee payer and the sponsor flow (specs/01-arquitectura.md §5.1, §6):
 * validate → count against the daily limit → co-sign → send.
 */
import { clusterApiUrl, Connection, Keypair, PublicKey, type Transaction } from "@solana/web3.js";

import { PROGRAM_ID } from "../vaultix/pdas";
import type { AuthUser } from "./auth";
import { need, serverEnv } from "./env";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";
import { decodeTransaction, validateSponsoredTx } from "./sponsor-validate";

/** Circle's devnet USDC, when `NEXT_PUBLIC_USDC_MINT` is unset. */
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function parseSecretKey(json: string): Keypair {
  let bytes: unknown;
  try {
    bytes = JSON.parse(json);
  } catch {
    throw new Error("FEE_PAYER_SECRET_KEY must be a JSON array of 64 bytes");
  }
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw new Error("FEE_PAYER_SECRET_KEY must be a JSON array of 64 bytes");
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** UTC day as `YYYY-MM-DD`, the `sponsor_usage.day` key. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface SponsorDeps {
  feePayer: Keypair;
  programId: PublicKey;
  usdcMint: PublicKey;
  dailyLimit: number;
  /** Atomically increments and returns today's count for the user. */
  incrementUsage(privyUserId: string, day: string): Promise<number>;
  send(raw: Buffer): Promise<string>;
  now?: () => Date;
}

function isBlockhashExpired(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /blockhash not found|block height exceeded|BlockhashNotFound/i.test(text);
}

export function createSponsor(deps: SponsorDeps) {
  return async function sponsor(user: AuthUser, base64: unknown): Promise<{ signature: string }> {
    const tx: Transaction = decodeTransaction(base64);
    validateSponsoredTx(tx, {
      feePayer: deps.feePayer.publicKey,
      userPubkeys: user.solanaPubkeys,
      programId: deps.programId,
      usdcMint: deps.usdcMint,
    });

    // Rule 4: counted before sending, so failed attempts count too.
    const count = await deps.incrementUsage(user.privyUserId, utcDay(deps.now?.()));
    if (count > deps.dailyLimit) throw new ApiError("rate_limited");

    tx.partialSign(deps.feePayer);
    if (!tx.verifySignatures(true)) throw new ApiError("bad_request", "Faltan firmas en la operación.");

    try {
      return { signature: await deps.send(tx.serialize()) };
    } catch (err) {
      if (isBlockhashExpired(err)) throw new ApiError("blockhash_expired", undefined, { cause: err });
      // Preflight simulation failed (e.g. an InvalidStatus): nothing was charged.
      console.warn("sponsored tx rejected", err);
      throw new ApiError("tx_failed", undefined, { cause: err });
    }
  };
}

export function solanaConnection(): Connection {
  // AGENTS.md: the fee payer is devnet-only; refuse to run it against mainnet.
  if (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta") {
    throw new Error("The sponsor fee payer is devnet-only");
  }
  return new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("devnet"), "confirmed");
}

let defaultSponsor: ReturnType<typeof createSponsor> | undefined;

export function sponsorTransaction(user: AuthUser, base64: unknown) {
  if (!defaultSponsor) {
    const connection = solanaConnection();
    defaultSponsor = createSponsor({
      feePayer: parseSecretKey(need("feePayerSecretKey")),
      programId: PROGRAM_ID,
      usdcMint: new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_USDC_MINT),
      dailyLimit: serverEnv().sponsorDailyLimit,
      async incrementUsage(privyUserId, day) {
        const { data, error } = await supabaseAdmin().rpc("increment_sponsor_usage", {
          p_user: privyUserId,
          p_day: day,
        });
        if (error) throw new Error(`sponsor_usage increment failed: ${error.message}`, { cause: error });
        return data;
      },
      send: (raw) => connection.sendRawTransaction(raw, { preflightCommitment: "confirmed" }),
    });
  }
  return defaultSponsor(user, base64);
}
