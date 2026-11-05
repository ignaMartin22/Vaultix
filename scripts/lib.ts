// Shared setup for the devnet scripts: provider, program client and protocol constants.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import idl from "../web/lib/vaultix/idl.json";
import type { VaultixEscrow } from "../web/lib/vaultix/vaultix_escrow";

/** Circle's devnet USDC (faucet.circle.com). */
export const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;
export const ONE_USDC = 10n ** BigInt(USDC_DECIMALS);

/** Protocol defaults (specs/01-arquitectura.md §8). */
export const PROTOCOL_DEFAULTS = {
  feeBps: 150,
  disputeDepositBps: 500,
  shipDeadlineSecs: 432_000n,
  claimWindowSecs: 864_000n,
  maxOrderAmount: 500n * ONE_USDC,
} as const;

export const CONFIG_SEED = Buffer.from("config");
export const ORDER_SEED = Buffer.from("order");

function rpcUrl(): string {
  const url = process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  // AGENTS.md: scripts only ever target devnet or a local validator.
  if (/mainnet/i.test(url)) {
    throw new Error(`Refusing to run against a mainnet RPC: ${url}`);
  }
  return url;
}

function loadKeypair(): Keypair {
  const path = process.env.SOLANA_KEYPAIR || join(homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function setup() {
  const connection = new Connection(rpcUrl(), "confirmed");
  const payer = loadKeypair();
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const program = new Program<VaultixEscrow>(idl as VaultixEscrow, provider);
  const mint = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_USDC_MINT);
  const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
  return { connection, payer, provider, program, mint, config };
}

/** Token program that owns the mint (Token or Token-2022). */
export async function mintTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found on this cluster`);
  return info.owner;
}

export function explorer(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
