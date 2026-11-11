// Indexes the program's past transactions into order_events by posting them
// to the deployed Helius webhook, in the same raw shape Helius sends. The
// webhook skips events it already has, so running this twice is harmless.
// Helius only delivers transactions that happen after the webhook exists;
// this fills in everything before it.
//
// Env: WEBHOOK_URL (https://<deploy>/api/webhooks/helius), HELIUS_WEBHOOK_AUTH,
// NEXT_PUBLIC_PROGRAM_ID, SOLANA_RPC (devnet by default).
import { Connection, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";

const BATCH = 20;

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const webhookURL = need("WEBHOOK_URL");
  const auth = need("HELIUS_WEBHOOK_AUTH");
  const rpc = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
  if (/mainnet/i.test(rpc)) throw new Error(`Refusing to backfill from a mainnet RPC: ${rpc}`);
  const program = new PublicKey(
    process.env.NEXT_PUBLIC_PROGRAM_ID || "Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg",
  );
  const connection = new Connection(rpc, "confirmed");

  // Every signature that touched the program, newest first, then replayed oldest first.
  const sigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(program, { before, limit: 1000 });
    sigs.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  const ok = sigs.filter((s) => !s.err).reverse();
  console.log(`${sigs.length} transactions touch the program, ${ok.length} succeeded.`);

  let received = 0;
  let inserted = 0;
  for (let i = 0; i < ok.length; i += BATCH) {
    const batch = ok.slice(i, i + BATCH);
    const txs = [];
    for (const s of batch) {
      // Same shape as `getTransaction` with JSON encoding: what a raw Helius webhook posts.
      const tx = await connection.getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (tx) txs.push(tx);
    }
    const res = await fetch(webhookURL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(txs),
    });
    if (!res.ok) throw new Error(`Webhook answered HTTP ${res.status}: ${await res.text()}`);
    const result = (await res.json()) as { received: number; inserted: number };
    received += result.received;
    inserted += result.inserted;
    console.log(`  ${Math.min(i + BATCH, ok.length)}/${ok.length}: +${result.inserted} new events`);
  }
  console.log(`Done: ${received} events read, ${inserted} new.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
