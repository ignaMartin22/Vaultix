/**
 * Server-side reads of the program's accounts on devnet, decoded without the
 * Anchor runtime. Owner-checked: an account not owned by the program is null.
 */
import { clusterApiUrl, Connection, type PublicKey } from "@solana/web3.js";

import type { ConfigAccount, OrderAccount } from "../vaultix/contract";
import { decodeConfigAccount, decodeOrderAccount } from "../vaultix/decode";
import { configPda, PROGRAM_ID } from "../vaultix/pdas";

let connection: Connection | undefined;

export function serverConnection(): Connection {
  connection ??= new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("devnet"), "confirmed");
  return connection;
}

export async function readOrder(address: PublicKey): Promise<OrderAccount | null> {
  const info = await serverConnection().getAccountInfo(address, "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return decodeOrderAccount(info.data);
}

export async function readConfig(): Promise<ConfigAccount | null> {
  const info = await serverConnection().getAccountInfo(configPda(), "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return decodeConfigAccount(info.data);
}
