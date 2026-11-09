// Changes only the arbiter in the devnet Config, via `update_config` signed by
// the admin. Every other parameter (fees, deadlines, max amount, treasury) is
// read from the current Config and sent back unchanged.
//
// Env: ARBITER_PUBKEY (required), SOLANA_RPC, SOLANA_KEYPAIR (the admin).
import { PublicKey } from "@solana/web3.js";

import { explorer, setup } from "./lib";

async function main() {
  const value = process.env.ARBITER_PUBKEY;
  if (!value) throw new Error("ARBITER_PUBKEY is required");
  const arbiter = new PublicKey(value);

  const { payer, program, config } = setup();
  const current = await program.account.config.fetch(config);
  if (!current.admin.equals(payer.publicKey)) {
    throw new Error(`The local keypair ${payer.publicKey.toBase58()} is not the admin ${current.admin.toBase58()}`);
  }
  console.log(`Arbiter: ${current.arbiter.toBase58()} -> ${arbiter.toBase58()}`);
  if (current.arbiter.equals(arbiter)) {
    console.log("Already the arbiter, nothing to do.");
    return;
  }

  const sig = await program.methods
    .updateConfig({
      arbiter,
      feeBps: current.feeBps,
      disputeDepositBps: current.disputeDepositBps,
      shipDeadlineSecs: current.shipDeadlineSecs,
      claimWindowSecs: current.claimWindowSecs,
      maxOrderAmount: current.maxOrderAmount,
    })
    .accountsPartial({ admin: payer.publicKey, config, treasury: current.treasury })
    .rpc();
  console.log(`update_config: ${explorer(sig)}`);

  const after = await program.account.config.fetch(config);
  console.log(`Arbiter now: ${after.arbiter.toBase58()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
