import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import type { OrderEventRow } from "./events";
import { createNotifier, type NotifierDeps, type OutgoingMail } from "./mail";
import { FORBIDDEN_WORDS, mailsFor, type MailContext } from "./mail-templates";

const ctx: MailContext = { product: "Campera de cuero", orderUrl: "https://vaultix.app/p/PDA1" };

function row(event_type: OrderEventRow["event_type"], payload: OrderEventRow["payload"], order_pda = "PDA1"): OrderEventRow {
  return { signature: "s", event_index: 0, order_pda, event_type, payload, slot: 1, block_time: null };
}

const EVENTS: OrderEventRow[] = [
  row("OrderPaid", { buyer: "BUYER", amount: "45000000" }),
  row("OrderShipped", { tracking_hash: null }),
  row("OrderReleased", { seller_amount: "44325000", fee: "675000", by_timeout: false }),
  row("OrderRefunded", { buyer_amount: "45000000" }),
  row("DisputeOpened", { deposit: "2250000" }),
  row("DisputeResolved", { buyer_amount: "35580000", seller_amount: "11570000", fee: "100000", deposit_to_buyer: true }),
];

describe("mail templates (02 §4)", () => {
  it("use the subjects of the table, data first", () => {
    const subjects = (e: OrderEventRow, c: MailContext = ctx) => mailsFor(e, c).map((m) => [m.to, m.subject]);
    // 2026-11-12 17:30 UTC = jueves 12/11, 14:30 in Buenos Aires.
    const shipBy = BigInt(Date.UTC(2026, 10, 12, 17, 30) / 1000);
    expect(subjects(EVENTS[0], { ...ctx, shipBy })).toEqual([
      ["seller", "Te pagaron Campera de cuero. Despachá antes del jueves 12/11, 14:30."],
    ]);
    expect(subjects(EVENTS[1])).toEqual([["buyer", "El vendedor despachó Campera de cuero."]]);
    expect(subjects(EVENTS[2])).toEqual([["seller", "Cobraste USDC 44.325 por Campera de cuero."]]);
    expect(subjects(EVENTS[3])).toEqual([["buyer", "Te devolvimos USDC 45.00."]]);
    expect(subjects(EVENTS[4])).toEqual([
      ["seller", "Abrieron un reclamo por Campera de cuero. Subí tu evidencia."],
      ["arbiter", "Abrieron un reclamo por Campera de cuero."],
    ]);
    expect(subjects(EVENTS[5])).toEqual([
      ["buyer", "Se resolvió el reclamo por Campera de cuero."],
      ["seller", "Se resolvió el reclamo por Campera de cuero."],
    ]);
  });

  it("never use forbidden jargon", () => {
    for (const event of EVENTS) {
      for (const m of mailsFor(event, { ...ctx, shipBy: 1_750_000_000n })) {
        const text = `${m.subject}\n${m.text}`.toLowerCase();
        for (const word of FORBIDDEN_WORDS) expect(text, `${event.event_type}: "${word}"`).not.toMatch(new RegExp(`\b${word}\b`));
      }
    }
  });

  it("link to the order (and the arbiter to the panel), escaping HTML", () => {
    const [seller, arbiter] = mailsFor(EVENTS[4], ctx);
    expect(seller.text).toContain("https://vaultix.app/p/PDA1");
    expect(arbiter.text).toContain("https://vaultix.app/admin/disputes");
    const [refund] = mailsFor(EVENTS[3], { ...ctx, product: "<b>Bici</b>" });
    expect(refund.html).toContain("&lt;b&gt;Bici&lt;/b&gt;");
    expect(refund.html).not.toContain("<b>Bici</b>");
  });

  it("send nothing for events outside the table", () => {
    expect(mailsFor(row("OrderCreated", {}), ctx)).toEqual([]);
    expect(mailsFor(row("OrderClosed", {}), ctx)).toEqual([]);
  });
});

describe("notifier", () => {
  function setup(overrides: Partial<NotifierDeps> = {}) {
    const sent: OutgoingMail[] = [];
    const deps: NotifierDeps = {
      siteUrl: "https://vaultix.app",
      arbiterEmail: "arbitro@vaultix.app",
      listings: async () => new Map([["PDA1", { title: "Campera", seller: "SELLER" }]]),
      buyers: async () => new Map(),
      emails: async (keys) =>
        new Map(keys.flatMap((k) => (k === "SELLER" ? [[k, "vende@x.com"]] : k === "BUYER" ? [[k, "compra@x.com"]] : []))),
      readOrder: async () => null,
      send: vi.fn(async (m: OutgoingMail) => void sent.push(m)),
      ...overrides,
    };
    return { notify: createNotifier(deps), sent, deps };
  }

  it("addresses each mail from profiles, and the arbiter from ARBITER_EMAIL", async () => {
    const { notify, sent } = setup();
    await notify([row("OrderPaid", { buyer: "BUYER", amount: "45000000" }), row("OrderShipped", {}), row("DisputeOpened", {})]);
    expect(sent.map((m) => m.to)).toEqual(["vende@x.com", "compra@x.com", "vende@x.com", "arbitro@vaultix.app"]);
  });

  it("finds the buyer from stored OrderPaid events when not in the batch", async () => {
    const { notify, sent } = setup({ buyers: async () => new Map([["PDA1", "BUYER"]]) });
    await notify([row("OrderRefunded", { buyer_amount: "45000000" })]);
    expect(sent.map((m) => m.to)).toEqual(["compra@x.com"]);
  });

  it("uses the order's own ship deadline in the OrderPaid subject", async () => {
    const paidAt = BigInt(Date.UTC(2026, 10, 7, 17, 30) / 1000);
    const pda = Keypair.generate().publicKey.toBase58();
    const { notify, sent } = setup({
      listings: async () => new Map([[pda, { title: "Campera", seller: "SELLER" }]]),
      // 7/11 + 5 days.
      readOrder: async () =>
        ({ paidAt, shipDeadlineSecs: 432_000n }) as unknown as Awaited<ReturnType<NotifierDeps["readOrder"]>>,
    });
    await notify([row("OrderPaid", { buyer: "BUYER", amount: "1000000" }, pda)]);
    expect(sent[0]?.subject).toBe("Te pagaron Campera. Despachá antes del jueves 12/11, 14:30.");
  });

  it("skips people without email and keeps going when one send fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(async (m: OutgoingMail) => {
      if (m.to === "vende@x.com") throw new Error("Resend down");
    });
    const { notify } = setup({ send, emails: async () => new Map([["SELLER", "vende@x.com"]]) });
    const res = await notify([row("DisputeOpened", {}), row("OrderShipped", {})]);
    expect(res).toEqual({ sent: 1, failed: 1 }); // arbiter sent; buyer has no email
    err.mockRestore();
  });
});
