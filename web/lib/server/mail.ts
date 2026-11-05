/**
 * Sends the 02 §4 notifications for newly indexed events (B-07). Recipients
 * come from `profiles.email` by pubkey (seller from the listing, buyer from
 * the order's OrderPaid event), the arbiter from ARBITER_EMAIL. A failed send
 * is logged and not retried (MVP).
 */
import { PublicKey } from "@solana/web3.js";

import type { OrderAccount } from "../vaultix/contract";
import { readOrder } from "./chain";
import { serverEnv } from "./env";
import type { OrderEventRow } from "./events";
import { mailsFor, type Mail, type Recipient } from "./mail-templates";
import { supabaseAdmin } from "./supabase";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface NotifierDeps {
  siteUrl: string;
  arbiterEmail: string | null;
  /** order_pda → { title, seller } of its listing. */
  listings(orderPdas: string[]): Promise<Map<string, { title: string; seller: string }>>;
  /** order_pda → buyer pubkey, from stored OrderPaid events. */
  buyers(orderPdas: string[]): Promise<Map<string, string>>;
  /** pubkey → email. */
  emails(pubkeys: string[]): Promise<Map<string, string>>;
  readOrder(address: PublicKey): Promise<OrderAccount | null>;
  send(mail: OutgoingMail): Promise<void>;
}

export function createNotifier(deps: NotifierDeps) {
  return async function notify(rows: OrderEventRow[]): Promise<{ sent: number; failed: number }> {
    const pdas = [...new Set(rows.map((r) => r.order_pda))];
    const [listings, storedBuyers] = await Promise.all([deps.listings(pdas), deps.buyers(pdas)]);

    // The same batch may contain the OrderPaid that names the buyer.
    const buyers = new Map(storedBuyers);
    for (const r of rows) if (r.event_type === "OrderPaid" && typeof r.payload.buyer === "string") buyers.set(r.order_pda, r.payload.buyer);

    const planned: { mail: Mail; pda: string }[] = [];
    for (const row of rows) {
      let shipBy: bigint | null = null;
      if (row.event_type === "OrderPaid") {
        // Without the order we still send the mail, just without the date.
        try {
          const order = await deps.readOrder(new PublicKey(row.order_pda));
          shipBy = order ? order.paidAt + order.shipDeadlineSecs : null;
        } catch {
          shipBy = null;
        }
      }
      const ctx = {
        product: listings.get(row.order_pda)?.title ?? null,
        orderUrl: `${deps.siteUrl}/p/${row.order_pda}`,
        shipBy,
      };
      for (const mail of mailsFor(row, ctx)) planned.push({ mail, pda: row.order_pda });
    }

    const pubkeyOf = (to: Recipient, pda: string) =>
      to === "seller" ? listings.get(pda)?.seller : to === "buyer" ? buyers.get(pda) : undefined;
    const pubkeys = [...new Set(planned.flatMap(({ mail, pda }) => pubkeyOf(mail.to, pda) ?? []))];
    const emails = pubkeys.length > 0 ? await deps.emails(pubkeys) : new Map<string, string>();

    let sent = 0;
    let failed = 0;
    for (const { mail, pda } of planned) {
      const address = mail.to === "arbiter" ? deps.arbiterEmail : emails.get(pubkeyOf(mail.to, pda) ?? "");
      if (!address) continue; // No email on file (e.g. signed up with Phantom only).
      try {
        await deps.send({ to: address, subject: mail.subject, text: mail.text, html: mail.html });
        sent++;
      } catch (err) {
        failed++;
        console.error(`mail "${mail.subject}" to ${mail.to} failed`, err);
      }
    }
    return { sent, failed };
  };
}

/** Resend's REST API: one POST per mail, no SDK needed. */
export async function sendWithResend(apiKey: string, from: string, mail: OutgoingMail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${await res.text()}`);
}

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Null when Resend isn't configured: indexing keeps working, mails are skipped. */
export function defaultNotifier(): ReturnType<typeof createNotifier> | null {
  const env = serverEnv();
  if (!env.resendApiKey || !env.mailFrom) {
    console.warn("RESEND_API_KEY or MAIL_FROM missing: notifications are disabled.");
    return null;
  }
  const { resendApiKey, mailFrom } = env;
  const db = supabaseAdmin();
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`, { cause: error });
  };

  return createNotifier({
    siteUrl: siteUrl(),
    arbiterEmail: env.arbiterEmail ?? null,
    async listings(pdas) {
      const { data, error } = await db.from("listings").select("order_pda, title, seller_pubkey").in("order_pda", pdas);
      if (error) fail("listings", error);
      return new Map((data ?? []).flatMap((l) => (l.order_pda ? [[l.order_pda, { title: l.title, seller: l.seller_pubkey }]] : [])));
    },
    async buyers(pdas) {
      const { data, error } = await db
        .from("order_events")
        .select("order_pda, payload")
        .eq("event_type", "OrderPaid")
        .in("order_pda", pdas);
      if (error) fail("order_events", error);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        const buyer = (row.payload as { buyer?: unknown } | null)?.buyer;
        if (typeof buyer === "string") map.set(row.order_pda, buyer);
      }
      return map;
    },
    async emails(pubkeys) {
      const { data, error } = await db.from("profiles").select("wallet_pubkey, email").in("wallet_pubkey", pubkeys);
      if (error) fail("profiles", error);
      return new Map((data ?? []).flatMap((p) => (p.email ? [[p.wallet_pubkey, p.email]] : [])));
    },
    readOrder,
    send: (mail) => sendWithResend(resendApiKey, mailFrom, mail),
  });
}
