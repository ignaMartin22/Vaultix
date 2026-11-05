import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PROTOCOL,
  VAULTIX_ERROR_CODES,
  type OrderStatus,
  type VaultixErrorCode,
} from "./contract";
import { MockVaultixClient, computeDisputeSplit, computeReleaseSplit } from "./mock";
import { associatedTokenAddress, configPda, orderPda, u64ToLeBytes, vaultAddress } from "./pdas";

const T0 = 1_750_000_000n;
const AMOUNT = 120_000_000n; // USDC 120.00
const HASH = new Uint8Array(32).fill(7);

let mock: MockVaultixClient;
let seller: Keypair;
let buyer: Keypair;
let arbiter: Keypair;
let stranger: Keypair;
let orderId: bigint;
let order: PublicKey;

function apply(tx: Transaction, ...signers: Keypair[]) {
  if (signers.length > 0) tx.partialSign(...signers);
  return mock.applyTransaction(tx);
}

async function expectCode(promise: Promise<unknown> | (() => unknown), code: VaultixErrorCode) {
  const run = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  await expect(run).rejects.toMatchObject({ code });
}

const usdc = (owner: PublicKey) => mock.getUsdcBalance(owner);

async function treasuryBalance() {
  const config = await mock.getConfig();
  return mock.tokenBalance(config!.treasury);
}

async function status(): Promise<OrderStatus | undefined> {
  return (await mock.getOrder(order))?.status;
}

async function create(amount = AMOUNT) {
  return apply(await mock.buildCreateOrderTx({ seller: seller.publicKey, orderId, amount, listingHash: HASH }), seller);
}
const pay = async () => apply(await mock.buildPayTx({ order, buyer: buyer.publicKey }), buyer);
const ship = async () =>
  apply(await mock.buildMarkShippedTx({ order, seller: seller.publicKey, trackingHash: null }), seller);
const confirm = async () => apply(await mock.buildConfirmReceiptTx({ order, buyer: buyer.publicKey }), buyer);
const release = async () => apply(await mock.buildReleaseTx({ order }));
const refund = async () => apply(await mock.buildRefundUnshippedTx({ order }));
const dispute = async () => apply(await mock.buildOpenDisputeTx({ order, buyer: buyer.publicKey }), buyer);
const resolve = async (buyerShareBps: number) =>
  apply(await mock.buildResolveDisputeTx({ order, arbiter: arbiter.publicKey, buyerShareBps }), arbiter);
const close = async (authority: Keypair) =>
  apply(await mock.buildCloseOrderTx({ order, authority: authority.publicKey }), authority);

beforeEach(() => {
  seller = Keypair.generate();
  buyer = Keypair.generate();
  arbiter = Keypair.generate();
  stranger = Keypair.generate();
  mock = new MockVaultixClient({ now: T0, config: { arbiter: arbiter.publicKey } });
  orderId = 42n;
  order = orderPda(seller.publicKey, orderId, mock.programId);
  mock.mintUsdc(buyer.publicKey, 1_000_000_000n);
  mock.mintUsdc(stranger.publicKey, 1_000_000_000n);
});

describe("pdas", () => {
  it("encodes order_id as u64 little-endian", () => {
    expect(Array.from(u64ToLeBytes(0x0102n))).toEqual([2, 1, 0, 0, 0, 0, 0, 0]);
    expect(() => u64ToLeBytes(-1n)).toThrow(RangeError);
  });

  it("derives deterministic PDAs", () => {
    expect(configPda().equals(configPda())).toBe(true);
    expect(orderPda(seller.publicKey, 1n).equals(orderPda(seller.publicKey, 2n))).toBe(false);
  });

  it("numbers custom errors from 6000", () => {
    expect(VAULTIX_ERROR_CODES.InvalidStatus).toBe(6000);
    expect(VAULTIX_ERROR_CODES.MathOverflow).toBe(6016);
  });
});

describe("builders", () => {
  it("set the sponsor fee payer and a blockhash", async () => {
    const tx = await mock.buildPayTx({ order, buyer: buyer.publicKey });
    expect(tx.feePayer?.equals(mock.feePayer)).toBe(true);
    expect(tx.recentBlockhash).toBeTruthy();
    expect(tx.signatures.every((s) => s.signature === null)).toBe(true);
  });

  it("let the arbiter pay for resolve_dispute", async () => {
    const tx = await mock.buildResolveDisputeTx({ order, arbiter: arbiter.publicKey, buyerShareBps: 0 });
    expect(tx.feePayer?.equals(arbiter.publicKey)).toBe(true);
  });

  it("reject hashes that are not 32 bytes", async () => {
    await expect(
      mock.buildCreateOrderTx({ seller: seller.publicKey, orderId, amount: AMOUNT, listingHash: new Uint8Array(31) }),
    ).rejects.toThrow(RangeError);
  });
});

describe("happy path", () => {
  it("create → pay → ship → confirm pays seller and treasury and empties the vault", async () => {
    const created = await create();
    expect(created.events[0]).toMatchObject({ name: "OrderCreated", amount: AMOUNT, orderId });
    const account = (await mock.getOrder(order))!;
    expect(account).toMatchObject({
      status: "Created",
      buyer: null,
      feeBps: DEFAULT_PROTOCOL.feeBps,
      createdAt: T0,
    });
    expect(account.rentPayer.equals(mock.feePayer)).toBe(true);

    await pay();
    expect(await status()).toBe("Paid");
    expect(mock.tokenBalance(vaultAddress(order, account.mint))).toBe(AMOUNT);

    mock.advanceClock(100n);
    await ship();
    expect((await mock.getOrder(order))!.shippedAt).toBe(T0 + 100n);

    const result = await confirm();
    expect(await status()).toBe("Released");
    // 1.5% of 120.00 = 1.80
    expect(result.events[0]).toMatchObject({ name: "OrderReleased", fee: 1_800_000n, sellerAmount: 118_200_000n, byTimeout: false });
    expect(await usdc(seller.publicKey)).toBe(118_200_000n);
    expect(await treasuryBalance()).toBe(1_800_000n);
    expect(mock.tokenBalance(vaultAddress(order, account.mint))).toBe(0n);
    expect(await usdc(buyer.publicKey)).toBe(1_000_000_000n - AMOUNT);
  });

  it("lists orders by seller, buyer and status", async () => {
    await create();
    await pay();
    expect(await mock.getOrders({ seller: seller.publicKey })).toHaveLength(1);
    expect(await mock.getOrders({ buyer: buyer.publicKey, status: "Paid" })).toHaveLength(1);
    expect(await mock.getOrders({ status: "Created" })).toHaveLength(0);
    expect(await mock.getOrders({ buyer: stranger.publicKey })).toHaveLength(0);
  });
});

describe("invalid transitions fail with InvalidStatus", () => {
  const goTo: Record<string, () => Promise<unknown>> = {
    Created: () => create(),
    Paid: async () => {
      await create();
      await pay();
    },
    Shipped: async () => {
      await create();
      await pay();
      await ship();
    },
    Disputed: async () => {
      await create();
      await pay();
      await ship();
      await dispute();
    },
    Released: async () => {
      await create();
      await pay();
      await ship();
      await confirm();
    },
    Refunded: async () => {
      await create();
      await pay();
      mock.advanceClock(DEFAULT_PROTOCOL.shipDeadlineSecs + 1n);
      await refund();
    },
    Resolved: async () => {
      await create();
      await pay();
      await ship();
      await dispute();
      await resolve(5_000);
    },
  };

  // Instruction → states where it is allowed. Deadlines are pushed past every window
  // so the only failing check is the status.
  const instructions: [string, OrderStatus[], () => Promise<unknown>][] = [
    ["pay", ["Created"], pay],
    ["mark_shipped", ["Paid"], ship],
    ["confirm_receipt", ["Shipped"], confirm],
    ["release", ["Shipped"], release],
    ["refund_unshipped", ["Paid"], refund],
    ["open_dispute", ["Shipped"], dispute],
    ["resolve_dispute", ["Disputed"], () => resolve(5_000)],
  ];

  for (const [name, allowed, run] of instructions) {
    for (const from of Object.keys(goTo) as OrderStatus[]) {
      if (allowed.includes(from)) continue;
      it(`${name} from ${from}`, async () => {
        await goTo[from]();
        await expectCode(run, "InvalidStatus");
        expect(await status()).toBe(from);
      });
    }
  }

  it("seller cannot pay their own order", async () => {
    await create();
    mock.mintUsdc(seller.publicKey, AMOUNT);
    await expectCode(
      async () => apply(await mock.buildPayTx({ order, buyer: seller.publicKey }), seller),
      "SellerCannotBuy",
    );
  });

  it("a second payer cannot take a paid order", async () => {
    await create();
    await pay();
    await expectCode(
      async () => apply(await mock.buildPayTx({ order, buyer: stranger.publicKey }), stranger),
      "InvalidStatus",
    );
  });
});

describe("access control", () => {
  beforeEach(async () => {
    await create();
    await pay();
  });

  it("mark_shipped from a non-seller fails", async () => {
    await expectCode(
      async () => apply(await mock.buildMarkShippedTx({ order, seller: stranger.publicKey, trackingHash: null }), stranger),
      "NotSeller",
    );
  });

  it("confirm_receipt and open_dispute from a non-buyer fail", async () => {
    await ship();
    await expectCode(
      async () => apply(await mock.buildConfirmReceiptTx({ order, buyer: stranger.publicKey }), stranger),
      "NotBuyer",
    );
    await expectCode(
      async () => apply(await mock.buildOpenDisputeTx({ order, buyer: stranger.publicKey }), stranger),
      "NotBuyer",
    );
  });

  it("resolve_dispute from a non-arbiter fails", async () => {
    await ship();
    await dispute();
    await expectCode(
      async () =>
        apply(await mock.buildResolveDisputeTx({ order, arbiter: stranger.publicKey, buyerShareBps: 0 }), stranger),
      "NotArbiter",
    );
  });

  it("an unsigned transaction fails", async () => {
    await expectCode(
      async () => mock.applyTransaction(await mock.buildMarkShippedTx({ order, seller: seller.publicKey, trackingHash: null })),
      "MissingRequiredSignature",
    );
  });

  it("insufficient balance fails atomically", async () => {
    const poor = Keypair.generate();
    orderId = 43n;
    order = orderPda(seller.publicKey, orderId, mock.programId);
    await create();
    await expectCode(
      async () => apply(await mock.buildPayTx({ order, buyer: poor.publicKey }), poor),
      "InsufficientFunds",
    );
    expect(await status()).toBe("Created");
  });
});

describe("amounts", () => {
  it("amount = 0 fails", async () => {
    await expectCode(() => create(0n), "InvalidAmount");
  });

  it("amount > max_order_amount fails, amount = max works", async () => {
    await expectCode(() => create(DEFAULT_PROTOCOL.maxOrderAmount + 1n), "AmountExceedsMax");
    await create(DEFAULT_PROTOCOL.maxOrderAmount);
    expect(await status()).toBe("Created");
  });

  it("a colliding order_id fails with AccountAlreadyInUse", async () => {
    await create();
    await expectCode(() => create(), "AccountAlreadyInUse");
  });

  it("create_order without config fails", async () => {
    mock = new MockVaultixClient({ now: T0, config: null });
    await expectCode(() => create(), "AccountNotInitialized");
  });
});

describe("deadlines", () => {
  beforeEach(async () => {
    await create();
    await pay();
  });

  it("refund_unshipped fails until ship_deadline passes, then refunds in full", async () => {
    mock.advanceClock(DEFAULT_PROTOCOL.shipDeadlineSecs);
    await expectCode(refund, "DeadlineNotReached");
    mock.advanceClock(1n);
    const result = await refund();
    expect(result.events[0]).toMatchObject({ name: "OrderRefunded", buyerAmount: AMOUNT });
    expect(await status()).toBe("Refunded");
    expect(await usdc(buyer.publicKey)).toBe(1_000_000_000n);
    expect(await treasuryBalance()).toBe(0n);
  });

  it("release fails until claim_window passes (from mark_shipped), then releases by timeout", async () => {
    mock.advanceClock(1_000n);
    await ship();
    mock.advanceClock(DEFAULT_PROTOCOL.claimWindowSecs);
    await expectCode(release, "DeadlineNotReached");
    mock.advanceClock(1n);
    const result = await release();
    expect(result.events[0]).toMatchObject({ name: "OrderReleased", byTimeout: true, fee: 1_800_000n });
    expect(await status()).toBe("Released");
  });

  it("open_dispute works at the last second of the claim window and fails after", async () => {
    await ship();
    mock.advanceClock(DEFAULT_PROTOCOL.claimWindowSecs + 1n);
    await expectCode(dispute, "ClaimWindowClosed");
    mock.advanceClock(-1n);
    const result = await dispute();
    // 5% deposit of 120.00 = 6.00
    expect(result.events[0]).toMatchObject({ name: "DisputeOpened", deposit: 6_000_000n });
    expect((await mock.getOrder(order))!.disputeDeposit).toBe(6_000_000n);
  });

  it("update_config after creation does not change the order's fee or deadlines", async () => {
    mock.setConfig({ feeBps: 500, claimWindowSecs: 10n, shipDeadlineSecs: 10n });
    mock.advanceClock(100n);
    await expectCode(refund, "DeadlineNotReached");
    await ship();
    mock.advanceClock(100n);
    const result = await confirm();
    expect(result.events[0]).toMatchObject({ name: "OrderReleased", fee: 1_800_000n });
  });
});

describe("fee and dispute split", () => {
  it("release fee rounds down and the remainder goes to the seller", () => {
    expect(computeReleaseSplit(1n, 150)).toEqual({ fee: 0n, sellerNet: 1n });
    expect(computeReleaseSplit(999_999n, 150)).toEqual({ fee: 14_999n, sellerNet: 985_000n });
  });

  const cases: [number, { buyer: bigint; seller: bigint; fee: bigint; depositToBuyer: boolean }][] = [
    // amount 120.00, fee 1.5%, deposit 6.00
    [0, { buyer: 0n, seller: 118_200_000n + 6_000_000n, fee: 1_800_000n, depositToBuyer: false }],
    // buyer_part = floor(120e6 * 3333 / 1e4) = 39_996_000; gross 80_004_000; fee 1_200_060
    [3_333, { buyer: 39_996_000n, seller: 78_803_940n + 6_000_000n, fee: 1_200_060n, depositToBuyer: false }],
    [5_000, { buyer: 60_000_000n + 6_000_000n, seller: 59_100_000n, fee: 900_000n, depositToBuyer: true }],
    [10_000, { buyer: 120_000_000n + 6_000_000n, seller: 0n, fee: 0n, depositToBuyer: true }],
  ];

  for (const [bps, expected] of cases) {
    it(`resolve_dispute with buyer_share_bps = ${bps}`, async () => {
      await create();
      await pay();
      await ship();
      await dispute();
      const buyerBefore = await usdc(buyer.publicKey);
      const result = await resolve(bps);

      expect(result.events[0]).toMatchObject({
        name: "DisputeResolved",
        buyerShareBps: bps,
        buyerAmount: expected.buyer,
        sellerAmount: expected.seller,
        fee: expected.fee,
        depositToBuyer: expected.depositToBuyer,
      });
      expect((await usdc(buyer.publicKey)) - buyerBefore).toBe(expected.buyer);
      expect(await usdc(seller.publicKey)).toBe(expected.seller);
      expect(await treasuryBalance()).toBe(expected.fee);
      const { mint } = (await mock.getOrder(order))!;
      expect(mock.tokenBalance(vaultAddress(order, mint))).toBe(0n);
      expect(expected.buyer + expected.seller + expected.fee).toBe(AMOUNT + 6_000_000n);
      expect(await status()).toBe("Resolved");
    });
  }

  it("buyer_share_bps > 10_000 fails", async () => {
    await create();
    await pay();
    await ship();
    await dispute();
    await expectCode(() => resolve(10_001), "InvalidShareBps");
    expect(() => computeDisputeSplit(AMOUNT, 150, 10_001, 0n)).toThrow();
  });
});

describe("close_order", () => {
  it("in Created only the seller can close", async () => {
    await create();
    await expectCode(() => close(stranger), "NotSeller");
    const result = await close(seller);
    expect(result.events[0]).toMatchObject({ name: "OrderClosed" });
    expect(await mock.getOrder(order)).toBeNull();
  });

  it("in a final state anyone can close and rent goes to rent_payer", async () => {
    await create();
    await pay();
    await ship();
    await confirm();
    const result = await close(stranger);
    expect(result.events[0]).toMatchObject({ name: "OrderClosed" });
    expect(result.events[0].name === "OrderClosed" && result.events[0].rentPayer.equals(mock.feePayer)).toBe(true);
    expect(await mock.getOrder(order)).toBeNull();
  });

  it("fails in non-final states", async () => {
    await create();
    await pay();
    await expectCode(() => close(seller), "InvalidStatus");
    await ship();
    await expectCode(() => close(seller), "InvalidStatus");
    await dispute();
    await expectCode(() => close(seller), "InvalidStatus");
  });

  it("fails if the vault is not empty", async () => {
    await create();
    const { mint } = (await mock.getOrder(order))!;
    mock.mintToTokenAccount(vaultAddress(order, mint), 1n);
    await expectCode(() => close(seller), "VaultNotEmpty");
  });

  it("frees the order_id for reuse", async () => {
    await create();
    await close(seller);
    await create();
    expect(await status()).toBe("Created");
  });
});

it("balances are keyed by ATA", async () => {
  const config = (await mock.getConfig())!;
  expect(mock.tokenBalance(associatedTokenAddress(buyer.publicKey, config.allowedMint))).toBe(1_000_000_000n);
});
