// Registers (or updates) the Helius webhook that posts every devnet
// transaction touching the program to /api/webhooks/helius (B-06).
// Idempotent: an existing webhook with the same URL is updated, not duplicated.
//
// Env: HELIUS_API_KEY, WEBHOOK_URL (https://<deploy>/api/webhooks/helius),
// HELIUS_WEBHOOK_AUTH (same value as the server env), NEXT_PUBLIC_PROGRAM_ID.
const API = "https://api.helius.xyz/v0/webhooks";

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

interface Webhook {
  webhookID: string;
  webhookURL: string;
}

async function main() {
  const apiKey = need("HELIUS_API_KEY");
  const webhookURL = need("WEBHOOK_URL");
  const authHeader = need("HELIUS_WEBHOOK_AUTH");
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID || "Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg";
  if (!webhookURL.startsWith("https://")) throw new Error("WEBHOOK_URL must be https");

  const config = {
    webhookURL,
    // Raw transactions on devnet: the server decodes the Anchor events itself.
    webhookType: "rawDevnet",
    transactionTypes: ["ANY"],
    accountAddresses: [programId],
    authHeader,
  };

  const list = await fetch(`${API}?api-key=${apiKey}`);
  if (!list.ok) throw new Error(`Listing webhooks failed: HTTP ${list.status}`);
  const existing = ((await list.json()) as Webhook[]).find((w) => w.webhookURL === webhookURL);

  const res = await fetch(existing ? `${API}/${existing.webhookID}?api-key=${apiKey}` : `${API}?api-key=${apiKey}`, {
    method: existing ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`${existing ? "Updating" : "Creating"} the webhook failed: HTTP ${res.status} ${await res.text()}`);
  const saved = (await res.json()) as Webhook;
  console.log(`${existing ? "Updated" : "Created"} webhook ${saved.webhookID} -> ${saved.webhookURL} (program ${programId})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
