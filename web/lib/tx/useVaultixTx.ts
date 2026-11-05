"use client";

/**
 * React side of the transaction lifecycle (specs/03-frontend.md §4): Privy signs,
 * the sponsor co-signs and sends (01 §5.1), we confirm at `confirmed`, retry on
 * an expired blockhash and invalidate the order and balance queries.
 */
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Connection, Transaction, type PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";

import { sponsorTransaction } from "../api";
import { getVaultixClient, isMockClient, solanaRpcUrl } from "../vaultix/client";
import type { VaultixClient } from "../vaultix/contract";
import { txErrorMessage } from "./errors";
import { needsUserSignature, runTx, type TxPhase, type TxSteps } from "./run";

export const vaultixKeys = {
  config: ["vaultix", "config"] as const,
  order: (address: string) => ["vaultix", "order", address] as const,
  orders: ["vaultix", "orders"] as const,
  balance: (owner: string) => ["vaultix", "balance", owner] as const,
};

export interface UseVaultixTxOptions {
  /** Builds a fresh transaction (called again on every retry). */
  build: (client: VaultixClient) => Promise<Transaction>;
  /** The account that signs (seller, buyer, arbiter); null for permissionless. */
  signer: PublicKey | null;
  /** Toast after confirming, e.g. "Listo: tu plata está en bóveda." */
  successMessage: string;
  /** Queries to refresh after confirming (order, balances…). */
  invalidate?: QueryKey[];
  /** `false` for the arbiter, who pays and sends on their own (03 §4). */
  sponsored?: boolean;
  onConfirmed?: (signature: string) => void;
}

const BUSY: readonly TxPhase[] = ["signing", "sending", "confirming"];

let connection: Connection | undefined;
function rpc(): Connection {
  connection ??= new Connection(solanaRpcUrl(), "confirmed");
  return connection;
}

export function useVaultixTx(options: UseVaultixTxOptions) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Always run with the latest options without re-creating `run`.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const run = useCallback(async (): Promise<string | null> => {
    const opts = latest.current;
    const client = getVaultixClient();
    setError(null);

    const wallet = opts.signer
      ? wallets.find((w) => w.address === opts.signer!.toBase58())
      : undefined;

    const steps: TxSteps = isMockClient(client)
      ? {
          build: () => opts.build(client),
          sign: async (tx) => tx,
          send: async (tx) => client.applyTransaction(tx, { signers: opts.signer ? [opts.signer] : [] }).signature,
          confirm: async () => {},
        }
      : {
          build: () => opts.build(client),
          async sign(tx) {
            if (!needsUserSignature(tx)) return tx;
            if (!wallet) throw new Error("No encontramos tu cuenta para firmar. Volvé a entrar.");
            const { signedTransaction } = await signTransaction({
              transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
              wallet,
            });
            return Transaction.from(signedTransaction);
          },
          async send(tx) {
            if (opts.sponsored === false) {
              return rpc().sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
            }
            const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
            return (await sponsorTransaction(wire, getAccessToken)).signature;
          },
          async confirm(signature, tx) {
            const { value } = await rpc().confirmTransaction(
              {
                signature,
                blockhash: tx.recentBlockhash!,
                lastValidBlockHeight: tx.lastValidBlockHeight!,
              },
              "confirmed",
            );
            if (value.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
          },
        };

    try {
      const signature = await runTx(steps, setPhase);
      await Promise.all(
        [...(opts.invalidate ?? []), vaultixKeys.orders].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      toast.show(opts.successMessage, "success");
      opts.onConfirmed?.(signature);
      return signature;
    } catch (err) {
      const message = txErrorMessage(err);
      setError(message);
      toast.show(message, "error");
      return null;
    }
  }, [getAccessToken, queryClient, signTransaction, toast, wallets]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, busy: BUSY.includes(phase), run, reset };
}
