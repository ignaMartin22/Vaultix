// Changes only the ship deadline and the claim window in the devnet Config, via
// `update_config` signed by the admin. Every other parameter (arbiter, fees,
// max amount, treasury) is read from the current Config and sent back unchanged.
//
// Orders copy both deadlines when they are created, so a change only affects
// orders created afterwards. Used to test refunds and releases by deadline in
// minutes instead of days; `DEADLINES=default` restores the protocol defaults.
//
// Env: DEADLINES ("default" | "<shipSecs>,<claimSecs>"), SOLANA_RPC,
// SOLANA_KEYPAIR (the admin). Without DEADLINES it only prints the current ones.
import { BN } from "@anchor-lang/core";

import { explorer, PROTOCOL_DEFAULTS, setup } from "./lib";

function parse(value: string): { ship: bigint; claim: bigint } {
  if (value === "default") {
    return { ship: PROTOCOL_DEFAULTS.shipDeadlineSecs, claim: PROTOCOL_DEFAULTS.claimWindowSecs };
  }
  const match = /^(\d+),(\d+)$/.exec(value);
  if (!match) throw new Error(`DEADLINES must be "default" or "<shipSecs>,<claimSecs>", got "${value}"`);
  return { ship: BigInt(match[1]), claim: BigInt(match[2]) };
}

function describe(secs: { toString(): string }): string {
  const s = Number(secs.toString());
  return s % 86_400 === 0 ? `${s / 86_400} días` : s % 60 === 0 ? `${s / 60} min` : `${s} s`;
}

async function main() {
  const { payer, program, config } = setup();
  const current = await program.account.config.fetch(config);
  console.log(
    `Now: ship ${describe(current.shipDeadlineSecs)}, claim ${describe(current.claimWindowSecs)}`,
  );

  const value = process.env.DEADLINES;
  if (!value) return;
  const next = parse(value);
  if (!current.admin.equals(payer.publicKey)) {
    throw new Error(`The local keypair ${payer.publicKey.toBase58()} is not the admin ${current.admin.toBase58()}`);
  }

  const sig = await program.methods
    .updateConfig({
      arbiter: current.arbiter,
      feeBps: current.feeBps,
      disputeDepositBps: current.disputeDepositBps,
      shipDeadlineSecs: new BN(next.ship.toString()),
      claimWindowSecs: new BN(next.claim.toString()),
      maxOrderAmount: current.maxOrderAmount,
    })
    .accountsPartial({ admin: payer.publicKey, config, treasury: current.treasury })
    .rpc();
  console.log(`update_config: ${explorer(sig)}`);

  const after = await program.account.config.fetch(config);
  console.log(`After: ship ${describe(after.shipDeadlineSecs)}, claim ${describe(after.claimWindowSecs)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
