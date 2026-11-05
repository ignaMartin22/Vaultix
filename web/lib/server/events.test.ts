import { Keypair, type PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import idl from "../vaultix/idl.json";
import { ApiError } from "./errors";
import { createWebhookHandler, decodeEvents, rowsFromWebhook, verifyWebhookAuth, type OrderEventRow } from "./events";

const PROGRAM = idl.address;
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const order = Keypair.generate().publicKey;
const seller = Keypair.generate().publicKey;
const buyer = Keypair.generate().publicKey;

/** Borsh bytes of an event as `emit!` writes them: discriminator + fields. */
function eventData(name: string, parts: (Uint8Array | number[])[]): string {
  const disc = idl.events.find((e) => e.name === name)!.discriminator;
  return Buffer.concat([Buffer.from(disc), ...parts.map((p) => Buffer.from(p))]).toString("base64");
}
const pk = (k: PublicKey) => k.toBytes();
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};
const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};

const created = eventData("OrderCreated", [pk(order), pk(seller), u64(42n), u64(45_000_000n), new Array(32).fill(7), i64(1_750_000_000n)]);
const paid = eventData("OrderPaid", [pk(order), pk(buyer), u64(45_000_000n), i64(1_750_000_100n)]);
const resolved = eventData("DisputeResolved", [
  pk(order),
  u16(3_333),
  u64(33_330_000n),
  u64(70_669_950n),
  u64(1_000_050n),
  [0],
  i64(1_750_000_200n),
]);

/** Logs shaped like a real transaction, with a CPI into the token program. */
function logs(...data: string[]) {
  return [
    `Program ${PROGRAM} invoke [1]`,
    "Program log: Instruction: Pay",
    `Program ${TOKEN} invoke [2]`,
    "Program log: Instruction: TransferChecked",
    `Program ${TOKEN} consumed 6200 of 180000 compute units`,
    `Program ${TOKEN} success`,
    ...data.map((d) => `Program data: ${d}`),
    `Program ${PROGRAM} consumed 24000 of 200000 compute units`,
    `Program ${PROGRAM} success`,
  ];
}

function rawTx(signature: string, logMessages: string[], err: unknown = null) {
  return { slot: 123, blockTime: 1_750_000_100, meta: { err, logMessages }, transaction: { signatures: [signature] } };
}

describe("decodeEvents", () => {
  it("decodes this program's events in order, with IDL field names", () => {
    const events = decodeEvents(logs(created, paid));
    expect(events.map((e) => e.name)).toEqual(["OrderCreated", "OrderPaid"]);
    expect((events[1].data.buyer as PublicKey).toBase58()).toBe(buyer.toBase58());
  });

  it("ignores program data emitted by other programs", () => {
    const foreign = [`Program ${TOKEN} invoke [1]`, `Program data: ${paid}`, `Program ${TOKEN} success`];
    expect(decodeEvents(foreign)).toEqual([]);
  });
});

describe("rowsFromWebhook", () => {
  it("turns events into order_events rows with JSON-friendly payloads", () => {
    const rows = rowsFromWebhook([rawTx("sig1", logs(created, paid)), rawTx("sig2", logs(resolved))]);
    expect(rows.map((r) => [r.signature, r.event_index, r.event_type])).toEqual([
      ["sig1", 0, "OrderCreated"],
      ["sig1", 1, "OrderPaid"],
      ["sig2", 0, "DisputeResolved"],
    ]);
    expect(rows[0]).toMatchObject({
      order_pda: order.toBase58(),
      slot: 123,
      block_time: new Date(1_750_000_100_000).toISOString(),
      payload: {
        seller: seller.toBase58(),
        order_id: "42",
        amount: "45000000",
        listing_hash: "07".repeat(32),
        timestamp: "1750000000",
      },
    });
    // What the reputation view casts: buyer_share_bps::int and deposit_to_buyer::boolean.
    expect(rows[2].payload).toMatchObject({ buyer_share_bps: 3333, deposit_to_buyer: false, fee: "1000050" });
  });

  it("skips failed transactions and transactions without our events", () => {
    expect(rowsFromWebhook([rawTx("bad", logs(paid), { InstructionError: [0, { Custom: 6000 }] })])).toEqual([]);
    expect(rowsFromWebhook([rawTx("none", ["Program 11111111111111111111111111111111 invoke [1]"])])).toEqual([]);
  });

  it("rejects bodies that aren't a list of transactions", () => {
    expect(() => rowsFromWebhook({ hello: "world" })).toThrow(ApiError);
  });
});

describe("webhook handler", () => {
  it("is idempotent: re-sending the same payload inserts and notifies nothing new", async () => {
    const stored = new Map<string, OrderEventRow>();
    const onNewEvents = vi.fn(async () => {});
    const handle = createWebhookHandler({
      insertNew: async (rows) => {
        const fresh = rows.filter((r) => !stored.has(`${r.signature}:${r.event_index}`));
        fresh.forEach((r) => stored.set(`${r.signature}:${r.event_index}`, r));
        return fresh;
      },
      onNewEvents,
    });
    const body = [rawTx("sig1", logs(created, paid))];
    await expect(handle(body)).resolves.toEqual({ received: 2, inserted: 2 });
    await expect(handle(body)).resolves.toEqual({ received: 2, inserted: 0 });
    expect(stored.size).toBe(2);
    expect(onNewEvents).toHaveBeenCalledTimes(1);
  });

  it("checks the shared Authorization header", () => {
    const req = (auth?: string) => new Request("https://x/api/webhooks/helius", { headers: auth ? { authorization: auth } : {} });
    expect(() => verifyWebhookAuth(req("s3cret"), "s3cret")).not.toThrow();
    expect(() => verifyWebhookAuth(req("wrong!"), "s3cret")).toThrow(ApiError);
    expect(() => verifyWebhookAuth(req(), "s3cret")).toThrow(ApiError);
    expect(() => verifyWebhookAuth(req("s3cret"), undefined)).toThrow(/not configured/);
  });
});
