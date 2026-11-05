import { Keypair, Transaction, type PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import type { OrderAccount, OrderStatus } from "../vaultix/contract";
import { CLOCK_MARGIN_SECS, createCrank, dueActions, MAX_ACTIONS_PER_RUN, verifyCronAuth, type CrankDeps } from "./crank";
import { ApiError } from "./errors";

const NOW = 2_000_000_000n;
const SHIP = 432_000n;
const CLAIM = 864_000n;

function order(status: OrderStatus, patch: Partial<OrderAccount> = {}): { address: PublicKey; account: OrderAccount } {
  return {
    address: Keypair.generate().publicKey,
    account: {
      status,
      seller: Keypair.generate().publicKey,
      buyer: Keypair.generate().publicKey,
      orderId: 1n,
      mint: Keypair.generate().publicKey,
      amount: 1n,
      feeBps: 150,
      disputeDepositBps: 500,
      shipDeadlineSecs: SHIP,
      claimWindowSecs: CLAIM,
      listingHash: new Uint8Array(32),
      trackingHash: null,
      disputeDeposit: 0n,
      createdAt: 1n,
      paidAt: 0n,
      shippedAt: 0n,
      rentPayer: Keypair.generate().publicKey,
      bump: 255,
      ...patch,
    },
  };
}

function deps(byStatus: Partial<Record<OrderStatus, ReturnType<typeof order>[]>>, overrides: Partial<CrankDeps> = {}): CrankDeps {
  return {
    listByStatus: async (s) => byStatus[s] ?? [],
    build: async () => new Transaction(),
    signAndSend: vi.fn(async () => "sig"),
    now: () => NOW,
    ...overrides,
  };
}

const cutoff = NOW - CLOCK_MARGIN_SECS;

describe("dueActions", () => {
  it("refunds Paid orders strictly past the ship deadline", async () => {
    const late = order("Paid", { paidAt: cutoff - SHIP - 1n });
    const onTime = order("Paid", { paidAt: cutoff - SHIP }); // exactly at the deadline: not yet
    const due = await dueActions(deps({ Paid: [late, onTime] }));
    expect(due).toEqual([{ order: late.address, action: "refund_unshipped" }]);
  });

  it("releases Shipped orders strictly past the claim window", async () => {
    const late = order("Shipped", { shippedAt: cutoff - CLAIM - 1n });
    const open = order("Shipped", { shippedAt: cutoff - CLAIM + 3_600n });
    const due = await dueActions(deps({ Shipped: [late, open] }));
    expect(due).toEqual([{ order: late.address, action: "release" }]);
  });

  it("closes every final order and leaves Created and Disputed alone", async () => {
    const finals = [order("Released"), order("Refunded"), order("Resolved")];
    const due = await dueActions(
      deps({ Released: [finals[0]], Refunded: [finals[1]], Resolved: [finals[2]], Created: [order("Created")], Disputed: [order("Disputed")] }),
    );
    expect(due.map((d) => d.action)).toEqual(["close_order", "close_order", "close_order"]);
    expect(due.map((d) => d.order)).toEqual(finals.map((f) => f.address));
  });

  it("uses a clock margin so a slightly fast server clock doesn't fire early", async () => {
    const justExpired = order("Paid", { paidAt: NOW - SHIP - 1n });
    await expect(dueActions(deps({ Paid: [justExpired] }))).resolves.toEqual([]);
  });
});

describe("crank run", () => {
  it("keeps going when one order fails and reports a summary", async () => {
    const a = order("Paid", { paidAt: 0n });
    const b = order("Shipped", { shippedAt: 0n });
    const c = order("Released");
    const signAndSend = vi
      .fn<CrankDeps["signAndSend"]>()
      .mockResolvedValueOnce("sigA")
      .mockRejectedValueOnce(new Error("custom program error: 0x177d"))
      .mockResolvedValueOnce("sigC");
    const run = createCrank(deps({ Paid: [a], Shipped: [b], Released: [c] }, { signAndSend }));
    const res = await run();
    expect(res).toMatchObject({ due: 3, attempted: 3, refunded: 1, released: 0, closed: 1, failed: 1 });
    expect(res.results[1]).toMatchObject({ order: b.address.toBase58(), action: "release", error: "custom program error: 0x177d" });
  });

  it("caps the actions per run and defers the rest", async () => {
    const many = Array.from({ length: MAX_ACTIONS_PER_RUN + 5 }, () => order("Released"));
    const res = await createCrank(deps({ Released: many }))();
    expect(res).toMatchObject({ due: many.length, attempted: MAX_ACTIONS_PER_RUN, deferred: 5 });
  });

  it("builds the right instruction for each action", async () => {
    const build = vi.fn(async () => new Transaction());
    const paid = order("Paid", { paidAt: 0n });
    await createCrank(deps({ Paid: [paid], Resolved: [order("Resolved")] }, { build }))();
    expect(build.mock.calls.map((c) => c[0])).toEqual(["refund_unshipped", "close_order"]);
  });
});

describe("verifyCronAuth", () => {
  const req = (auth?: string) => new Request("https://x/api/cron/crank", { headers: auth ? { authorization: auth } : {} });

  it("accepts only 'Bearer <CRON_SECRET>'", () => {
    expect(() => verifyCronAuth(req("Bearer s3cret"), "s3cret")).not.toThrow();
    for (const bad of [undefined, "s3cret", "Bearer wrong!", "bearer s3cret"]) {
      expect(() => verifyCronAuth(req(bad), "s3cret")).toThrow(ApiError);
    }
    expect(() => verifyCronAuth(req("Bearer x"), undefined)).toThrow(/not configured/);
  });
});
