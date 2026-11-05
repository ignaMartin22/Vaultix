// The real client against a fake cluster: every sponsored builder must produce
// a transaction the sponsor (B-03) accepts, with the accounts the program expects.
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../server/errors";
import { validateSponsoredTx } from "../server/sponsor-validate";
import { AnchorVaultixClient } from "./client";
import { DEFAULT_PROTOCOL, type ConfigAccount, type OrderAccount } from "./contract";
import idl from "./idl.json";
import { associatedTokenAddress, configPda, orderPda, TOKEN_PROGRAM_ID } from "./pdas";
import { encodeConfig, encodeOrder } from "./test-encode";

const programId = new PublicKey(idl.address);
const feePayer = Keypair.generate();
const seller = Keypair.generate();
const buyer = Keypair.generate();
const arbiter = Keypair.generate();
const mint = Keypair.generate().publicKey;
const rentPayer = Keypair.generate().publicKey;
const ORDER_ID = 42n;
const order = orderPda(seller.publicKey, ORDER_ID, programId);

const config: ConfigAccount = {
  admin: Keypair.generate().publicKey,
  arbiter: arbiter.publicKey,
  treasury: Keypair.generate().publicKey,
  allowedMint: mint,
  ...DEFAULT_PROTOCOL,
  bump: 255,
};

function orderAccount(patch: Partial<OrderAccount> = {}): OrderAccount {
  return {
    status: "Shipped",
    seller: seller.publicKey,
    buyer: buyer.publicKey,
    orderId: ORDER_ID,
    mint,
    amount: 45_000_000n,
    feeBps: 150,
    disputeDepositBps: 500,
    shipDeadlineSecs: 432_000n,
    claimWindowSecs: 864_000n,
    listingHash: new Uint8Array(32).fill(1),
    trackingHash: null,
    disputeDeposit: 0n,
    createdAt: 1n,
    paidAt: 2n,
    shippedAt: 3n,
    rentPayer,
    bump: 254,
    ...patch,
  };
}

let accounts: Map<string, { owner: PublicKey; data: Buffer }>;
let connection: Connection;
let client: AnchorVaultixClient;

beforeEach(() => {
  accounts = new Map([
    [configPda(programId).toBase58(), { owner: programId, data: Buffer.from(encodeConfig(config)) }],
    [mint.toBase58(), { owner: TOKEN_PROGRAM_ID, data: Buffer.alloc(82) }],
    [order.toBase58(), { owner: programId, data: Buffer.from(encodeOrder(orderAccount())) }],
  ]);
  connection = {
    getAccountInfo: vi.fn(async (pk: PublicKey) => accounts.get(pk.toBase58()) ?? null),
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 1_000,
    })),
    getProgramAccounts: vi.fn(async () => [{ pubkey: order, account: accounts.get(order.toBase58())! }]),
    getTokenAccountBalance: vi.fn(async () => {
      throw new Error("could not find account");
    }),
  } as unknown as Connection;
  client = new AnchorVaultixClient({ connection, feePayer: feePayer.publicKey, programId });
});

const ctx = (user: Keypair) => ({
  feePayer: feePayer.publicKey,
  userPubkeys: [user.publicKey.toBase58()],
  programId,
  usdcMint: mint,
});

function keysOf(tx: { instructions: { programId: PublicKey; keys: { pubkey: PublicKey }[] }[] }) {
  const ix = tx.instructions.find((i) => i.programId.equals(programId))!;
  return ix.keys.map((k) => k.pubkey.toBase58());
}

describe("AnchorVaultixClient reads", () => {
  it("decodes config and orders", async () => {
    await expect(client.getConfig()).resolves.toEqual(config);
    await expect(client.getOrder(order)).resolves.toEqual(orderAccount());
    await expect(client.getOrder(Keypair.generate().publicKey)).resolves.toBeNull();
  });

  it("filters orders by status with a memcmp at the status byte", async () => {
    const list = await client.getOrders({ status: "Shipped", seller: seller.publicKey });
    expect(list).toHaveLength(1);
    const [, opts] = vi.mocked(connection.getProgramAccounts).mock.calls[0];
    const filters = (opts as { filters: { memcmp: { offset: number } }[] }).filters;
    expect(filters.map((f) => f.memcmp.offset)).toEqual([0, 8, 9]);
  });

  it("reports a 0 balance when the token account doesn't exist", async () => {
    await expect(client.getUsdcBalance(buyer.publicKey)).resolves.toBe(0n);
  });
});

describe("AnchorVaultixClient builders pass the sponsor rules", () => {
  it("create_order: seller ATA + order, fee payer as rent payer", async () => {
    const tx = await client.buildCreateOrderTx({
      seller: seller.publicKey,
      orderId: ORDER_ID,
      amount: 45_000_000n,
      listingHash: new Uint8Array(32).fill(1),
    });
    expect(tx.feePayer?.equals(feePayer.publicKey)).toBe(true);
    expect(tx.recentBlockhash).toBeTruthy();
    tx.partialSign(seller);
    expect(validateSponsoredTx(tx, ctx(seller))).toEqual(["create_order"]);
    const keys = keysOf(tx);
    expect(keys[1]).toBe(feePayer.publicKey.toBase58()); // payer
    expect(keys[4]).toBe(order.toBase58());
    expect(keys[5]).toBe(associatedTokenAddress(order, mint).toBase58()); // vault
  });

  it("pay and open_dispute use the buyer's USDC account", async () => {
    for (const build of [
      () => client.buildPayTx({ order, buyer: buyer.publicKey }),
      () => client.buildOpenDisputeTx({ order, buyer: buyer.publicKey }),
    ]) {
      const tx = await build();
      tx.partialSign(buyer);
      expect(validateSponsoredTx(tx, ctx(buyer))).toHaveLength(1);
      expect(keysOf(tx)).toContain(associatedTokenAddress(buyer.publicKey, mint).toBase58());
    }
  });

  it("confirm_receipt pays the seller's ATA and the config treasury", async () => {
    const tx = await client.buildConfirmReceiptTx({ order, buyer: buyer.publicKey });
    tx.partialSign(buyer);
    expect(validateSponsoredTx(tx, ctx(buyer))).toEqual(["confirm_receipt"]);
    const keys = keysOf(tx);
    expect(keys[5]).toBe(associatedTokenAddress(seller.publicKey, mint).toBase58());
    expect(keys[6]).toBe(config.treasury.toBase58());
  });

  it("release and refund_unshipped need no user signature", async () => {
    const release = await client.buildReleaseTx({ order });
    expect(validateSponsoredTx(release, ctx(buyer))).toEqual(["release"]);
    accounts.set(order.toBase58(), { owner: programId, data: Buffer.from(encodeOrder(orderAccount({ status: "Paid" }))) });
    const refund = await client.buildRefundUnshippedTx({ order });
    expect(validateSponsoredTx(refund, ctx(buyer))).toEqual(["refund_unshipped"]);
    expect(keysOf(refund)[3]).toBe(associatedTokenAddress(buyer.publicKey, mint).toBase58());
  });

  it("mark_shipped and close_order (rent back to the order's rent payer)", async () => {
    const ship = await client.buildMarkShippedTx({ order, seller: seller.publicKey, trackingHash: new Uint8Array(32) });
    ship.partialSign(seller);
    expect(validateSponsoredTx(ship, ctx(seller))).toEqual(["mark_shipped"]);

    const close = await client.buildCloseOrderTx({ order, authority: seller.publicKey });
    close.partialSign(seller);
    expect(validateSponsoredTx(close, ctx(seller))).toEqual(["close_order"]);
    expect(keysOf(close)[4]).toBe(rentPayer.toBase58());
  });

  it("resolve_dispute is paid by the arbiter and never sponsored", async () => {
    const tx = await client.buildResolveDisputeTx({ order, arbiter: arbiter.publicKey, buyerShareBps: 5_000 });
    expect(tx.feePayer?.equals(arbiter.publicKey)).toBe(true);
    tx.partialSign(arbiter);
    expect(() => validateSponsoredTx(tx, ctx(arbiter))).toThrow(ApiError);
  });
});
