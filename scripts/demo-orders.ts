// Creates a few demo orders (status Created) sold by the local keypair.
// Idempotent: order ids are fixed and existing orders are skipped.
import { createHash } from "node:crypto";

import { BN } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { explorer, mintTokenProgram, ONE_USDC, ORDER_SEED, setup } from "./lib";

const DEMO_ORDERS = [
  { orderId: 1n, title: "Campera de cuero talle M", amount: 45n * ONE_USDC },
  { orderId: 2n, title: "Auriculares inalámbricos", amount: 80n * ONE_USDC },
  { orderId: 3n, title: "Bicicleta rodado 29", amount: 320n * ONE_USDC },
];

function u64Le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

async function main() {
  const { connection, payer, program, mint } = setup();
  const tokenProgram = await mintTokenProgram(connection, mint);
  const seller = payer.publicKey;

  for (const demo of DEMO_ORDERS) {
    const [order] = PublicKey.findProgramAddressSync(
      [ORDER_SEED, seller.toBuffer(), u64Le(demo.orderId)],
      program.programId,
    );
    if (await program.account.order.fetchNullable(order)) {
      console.log(`#${demo.orderId} exists: ${order.toBase58()}`);
      continue;
    }
    // Off-chain the hash covers the listing JSON; here the title is enough for a demo.
    const listingHash = [...createHash("sha256").update(demo.title).digest()];
    const vault = getAssociatedTokenAddressSync(mint, order, true, tokenProgram);
    const sig = await program.methods
      .createOrder(new BN(demo.orderId.toString()), new BN(demo.amount.toString()), listingHash)
      .accountsPartial({ seller, payer: seller, mint, order, vault, tokenProgram })
      .rpc();
    console.log(`#${demo.orderId} created: ${order.toBase58()} (${demo.title})`);
    console.log(`   ${explorer(sig)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
