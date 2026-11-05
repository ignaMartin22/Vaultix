/**
 * The transaction lifecycle of specs/03-frontend.md §4, without React:
 * build → sign → send → confirm, rebuilding up to 3 times when the blockhash
 * expires (01 §5.1 step 5). `useVaultixTx` plugs Privy and the sponsor in.
 */
import { TransactionExpiredBlockheightExceededError, type Transaction } from "@solana/web3.js";

import { ApiClientError } from "../api";

export type TxPhase = "idle" | "signing" | "sending" | "confirming" | "confirmed" | "failed";

export interface TxSteps {
  /** Fresh transaction with a recent blockhash (called again on every retry). */
  build(): Promise<Transaction>;
  /** The user's signature; may return the transaction untouched if nobody needs to sign. */
  sign(tx: Transaction): Promise<Transaction>;
  /** Sends (through the sponsor or directly) and returns the signature. */
  send(tx: Transaction): Promise<string>;
  /** Resolves at commitment `confirmed`; throws if the transaction failed or expired. */
  confirm(signature: string, tx: Transaction): Promise<void>;
}

export const MAX_ATTEMPTS = 3;

export function isBlockhashExpired(err: unknown): boolean {
  if (err instanceof TransactionExpiredBlockheightExceededError) return true;
  if (err instanceof ApiClientError) return err.code === "blockhash_expired";
  return err instanceof Error && /blockhash not found|block height exceeded/i.test(err.message);
}

export async function runTx(
  steps: TxSteps,
  onPhase: (phase: TxPhase) => void,
  maxAttempts: number = MAX_ATTEMPTS,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      onPhase("signing");
      const signed = await steps.sign(await steps.build());
      onPhase("sending");
      const signature = await steps.send(signed);
      onPhase("confirming");
      await steps.confirm(signature, signed);
      onPhase("confirmed");
      return signature;
    } catch (err) {
      if (isBlockhashExpired(err) && attempt < maxAttempts) continue;
      onPhase("failed");
      throw err;
    }
  }
}

/** True if someone other than the fee payer has to sign (not for `release`/`refund_unshipped`). */
export function needsUserSignature(tx: Transaction): boolean {
  return tx.compileMessage().header.numRequiredSignatures > 1;
}
