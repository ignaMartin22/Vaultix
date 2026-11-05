import { PublicKey } from "@solana/web3.js";

import { CONFIG_SEED, ORDER_SEED, U64_MAX } from "./contract";

/** Program id of the localnet/devnet build (Anchor.toml); overridden by env. */
export const DEFAULT_PROGRAM_ID = "Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xTPQ4oCKmzeBj4hAh",
);

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || DEFAULT_PROGRAM_ID,
);

const encoder = new TextEncoder();

/** u64 little-endian, as `order_id.to_le_bytes()` in Rust. */
export function u64ToLeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > U64_MAX) {
    throw new RangeError(`u64 out of range: ${value}`);
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

/** PDA `["config"]`. */
export function configPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(CONFIG_SEED)],
    programId,
  )[0];
}

/** PDA `["order", seller, order_id.to_le_bytes()]`. */
export function orderPda(
  seller: PublicKey,
  orderId: bigint,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(ORDER_SEED), seller.toBytes(), u64ToLeBytes(orderId)],
    programId,
  )[0];
}

/** Associated token account of `owner` for `mint` (owner may be a PDA). */
export function associatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** The order's vault: ATA of the order mint whose authority is the order PDA. */
export function vaultAddress(
  order: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  return associatedTokenAddress(order, mint, tokenProgram);
}

/** Random u64 for `create_order` (the client picks it; collisions are retried). */
export function randomOrderId(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return new DataView(bytes.buffer).getBigUint64(0, true);
}
