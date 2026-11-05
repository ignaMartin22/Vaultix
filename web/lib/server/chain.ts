/**
 * Server-side reads of the program's accounts on devnet, decoded without the
 * Anchor runtime. Owner-checked: an account not owned by the program is null.
 */
import { utils } from "@anchor-lang/core";
import { clusterApiUrl, Connection, type PublicKey } from "@solana/web3.js";

import { ORDER_STATUSES, type ConfigAccount, type OrderAccount } from "../vaultix/contract";
import { decodeConfigAccount, decodeOrderAccount, ORDER_DISCRIMINATOR, ORDER_OFFSETS } from "../vaultix/decode";
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

/** Every order in a given status (memcmp on the discriminator and the status byte). */
export async function readOrdersByStatus(
  status: OrderAccount["status"],
): Promise<{ address: PublicKey; account: OrderAccount }[]> {
  const accounts = await serverConnection().getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(ORDER_DISCRIMINATOR) } },
      { memcmp: { offset: ORDER_OFFSETS.status, bytes: utils.bytes.bs58.encode(Uint8Array.of(ORDER_STATUSES.indexOf(status))) } },
    ],
  });
  return accounts.map(({ pubkey, account }) => ({ address: pubkey, account: decodeOrderAccount(account.data) }));
}
