/**
 * The Solana network the web talks to, from env. One place for the cluster,
 * its RPC URLs and the chain id Privy expects ("solana:devnet" / "solana:mainnet").
 */
import { clusterApiUrl } from "@solana/web3.js";

export type Cluster = "devnet" | "mainnet-beta";

export const CLUSTER: Cluster =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";

/** HTTP RPC: NEXT_PUBLIC_SOLANA_RPC, else the public endpoint of the cluster. */
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(CLUSTER);

/** WebSocket RPC for subscriptions, derived from the HTTP one. */
export const RPC_WS_URL = RPC_URL.replace(/^http/, "ws");

/** Privy signs for this chain; without it, it assumes mainnet. */
export const PRIVY_SOLANA_CHAIN = CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";
