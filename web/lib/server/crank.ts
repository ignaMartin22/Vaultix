/**
 * Daily crank (specs/01-arquitectura.md §5.5, B-08). Everything it runs is
 * permissionless, so nobody waits on us, but this keeps funds from sitting:
 * - `Paid` past the ship deadline → `refund_unshipped`
 * - `Shipped` past the claim window → `release`
 * - `Released` / `Refunded` / `Resolved` → `close_order` (rent back to its payer)
 * One failing order never stops the rest; the run returns a summary.
 */
import { timingSafeEqual } from "node:crypto";

import type { Keypair, PublicKey, Transaction } from "@solana/web3.js";

import { activeDeadline } from "../deadlines";
import { AnchorVaultixClient } from "../vaultix/client";
import type { OrderAccount, OrderStatus } from "../vaultix/contract";
import { readOrdersByStatus } from "./chain";
import { need } from "./env";
import { ApiError } from "./errors";
import { parseSecretKey, solanaConnection } from "./fee-payer";

export type CrankAction = "refund_unshipped" | "release" | "close_order";

/** Leave a margin so our clock being a bit ahead of the cluster's doesn't waste a transaction. */
export const CLOCK_MARGIN_SECS = 60n;
/** Keeps one run within the serverless time limit; the rest goes in the next run. */
export const MAX_ACTIONS_PER_RUN = 25;

export interface CrankDeps {
  listByStatus(status: OrderStatus): Promise<{ address: PublicKey; account: OrderAccount }[]>;
  build(action: CrankAction, order: PublicKey): Promise<Transaction>;
  /** Signs with the fee payer, sends and confirms; returns the signature. */
  signAndSend(tx: Transaction): Promise<string>;
  now(): bigint;
}

export interface CrankResult {
  order: string;
  action: CrankAction;
  signature?: string;
  error?: string;
}

/** What is due right now, oldest statuses first. */
export async function dueActions(deps: Pick<CrankDeps, "listByStatus" | "now">): Promise<{ order: PublicKey; action: CrankAction }[]> {
  const now = deps.now() - CLOCK_MARGIN_SECS;
  const [paid, shipped, released, refunded, resolved] = await Promise.all(
    (["Paid", "Shipped", "Released", "Refunded", "Resolved"] as const).map((s) => deps.listByStatus(s)),
  );
  // Strictly past the deadline, as the program checks it.
  const expired = ({ account }: { account: OrderAccount }) => {
    const d = activeDeadline(account);
    return d !== null && now > d.at;
  };
  return [
    ...paid.filter(expired).map((o) => ({ order: o.address, action: "refund_unshipped" as const })),
    ...shipped.filter(expired).map((o) => ({ order: o.address, action: "release" as const })),
    ...[...released, ...refunded, ...resolved].map((o) => ({ order: o.address, action: "close_order" as const })),
  ];
}

export function createCrank(deps: CrankDeps) {
  return async function run() {
    const due = await dueActions(deps);
    const batch = due.slice(0, MAX_ACTIONS_PER_RUN);
    const results: CrankResult[] = [];
    // Sequential on purpose: one fee payer, no nonce races, easy to read in logs.
    for (const { order, action } of batch) {
      try {
        const signature = await deps.signAndSend(await deps.build(action, order));
        results.push({ order: order.toBase58(), action, signature });
      } catch (err) {
        results.push({ order: order.toBase58(), action, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const count = (a: CrankAction) => results.filter((r) => r.action === a && r.signature).length;
    return {
      due: due.length,
      attempted: batch.length,
      deferred: due.length - batch.length,
      refunded: count("refund_unshipped"),
      released: count("release"),
      closed: count("close_order"),
      failed: results.filter((r) => r.error).length,
      results,
    };
  };
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Constant-time compare. */
export function verifyCronAuth(req: Request, secret: string | undefined): void {
  if (!secret) throw new Error("CRON_SECRET is not configured");
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new ApiError("unauthorized");
}

function defaultDeps(): CrankDeps {
  const connection = solanaConnection();
  const feePayer: Keypair = parseSecretKey(need("feePayerSecretKey"));
  const client = new AnchorVaultixClient({ connection, feePayer: feePayer.publicKey });
  return {
    listByStatus: readOrdersByStatus,
    build(action, order) {
      if (action === "refund_unshipped") return client.buildRefundUnshippedTx({ order });
      if (action === "release") return client.buildReleaseTx({ order });
      // Final states: anyone may close; the rent goes back to the order's rent payer.
      return client.buildCloseOrderTx({ order, authority: feePayer.publicKey });
    },
    async signAndSend(tx) {
      tx.sign(feePayer);
      const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
      const { value } = await connection.confirmTransaction(
        { signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! },
        "confirmed",
      );
      if (value.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
      return signature;
    },
    now: () => BigInt(Math.floor(Date.now() / 1000)),
  };
}

let crank: ReturnType<typeof createCrank> | undefined;

export function runCrank() {
  crank ??= createCrank(defaultDeps());
  return crank();
}
