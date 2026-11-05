// Creates the treasury ATA and runs `initialize_config` with the defaults of
// specs/01-arquitectura.md §8. Idempotent: if the Config exists, it only prints it.
//
// Env: ARBITER_PUBKEY (defaults to the local keypair, as a provisional arbiter),
// NEXT_PUBLIC_USDC_MINT, SOLANA_RPC, SOLANA_KEYPAIR.
import { BN } from "@anchor-lang/core";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { explorer, mintTokenProgram, PROTOCOL_DEFAULTS, setup } from "./lib";

async function main() {
  const { connection, payer, program, mint, config } = setup();
  console.log(`Program:  ${program.programId.toBase58()}`);
  console.log(`Admin:    ${payer.publicKey.toBase58()}`);
  console.log(`Config:   ${config.toBase58()}`);

  const existing = await program.account.config.fetchNullable(config);
  if (existing) {
    console.log("Config already initialized, nothing to do:");
    printConfig(existing);
    return;
  }

  const arbiter = process.env.ARBITER_PUBKEY
    ? new PublicKey(process.env.ARBITER_PUBKEY)
    : payer.publicKey;
  if (!process.env.ARBITER_PUBKEY) {
    console.warn("ARBITER_PUBKEY not set: using the admin keypair as provisional arbiter.");
  }

  const tokenProgram = await mintTokenProgram(connection, mint);
  // The treasury is the admin's ATA of the allowed mint.
  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    false,
    "confirmed",
    undefined,
    tokenProgram,
  );
  console.log(`Treasury: ${treasury.address.toBase58()}`);

  const d = PROTOCOL_DEFAULTS;
  const sig = await program.methods
    .initializeConfig({
      arbiter,
      feeBps: d.feeBps,
      disputeDepositBps: d.disputeDepositBps,
      shipDeadlineSecs: new BN(d.shipDeadlineSecs.toString()),
      claimWindowSecs: new BN(d.claimWindowSecs.toString()),
      maxOrderAmount: new BN(d.maxOrderAmount.toString()),
    })
    .accountsPartial({
      admin: payer.publicKey,
      config,
      allowedMint: mint,
      treasury: treasury.address,
    })
    .rpc();
  console.log(`initialize_config: ${explorer(sig)}`);
  printConfig(await program.account.config.fetch(config));
}

type ConfigAccount = Awaited<ReturnType<ReturnType<typeof setup>["program"]["account"]["config"]["fetch"]>>;

function printConfig(c: ConfigAccount) {
  console.table({
    admin: c.admin.toBase58(),
    arbiter: c.arbiter.toBase58(),
    treasury: c.treasury.toBase58(),
    allowedMint: c.allowedMint.toBase58(),
    feeBps: c.feeBps,
    disputeDepositBps: c.disputeDepositBps,
    shipDeadlineSecs: c.shipDeadlineSecs.toString(),
    claimWindowSecs: c.claimWindowSecs.toString(),
    maxOrderAmount: c.maxOrderAmount.toString(),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
