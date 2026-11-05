import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listingHash } from "../listing-hash";
import type { OrderAccount } from "../vaultix/contract";
import { orderPda } from "../vaultix/pdas";
import type { AuthUser } from "./auth";
import { ApiError } from "./errors";
import { createListingsApi, parseDraftInput, type ListingDeps, type ListingRow } from "./listings";

const seller = Keypair.generate().publicKey;
const stranger = Keypair.generate().publicKey;
const ORDER_ID = 123_456_789n;
const ID = "11111111-2222-3333-4444-555555555555";

const sellerUser: AuthUser = {
  privyUserId: "did:privy:seller",
  pubkey: seller.toBase58(),
  solanaPubkeys: [seller.toBase58()],
  email: null,
};
const strangerUser: AuthUser = { ...sellerUser, privyUserId: "did:privy:x", pubkey: stranger.toBase58(), solanaPubkeys: [stranger.toBase58()] };

const draftBody = {
  title: "  Campera de cuero ",
  description: "Talle M",
  amountUnits: "45000000",
  photos: [{ contentType: "image/jpeg" }, { contentType: "image/webp" }],
};

let rows: Map<string, ListingRow>;
let onChain: OrderAccount | null;
let deps: ListingDeps;
let api: ReturnType<typeof createListingsApi>;

beforeEach(() => {
  rows = new Map();
  onChain = null;
  deps = {
    newId: () => ID,
    randomOrderId: () => ORDER_ID,
    insertDraft: vi.fn(async (row: Parameters<ListingDeps["insertDraft"]>[0]) => {
      rows.set(row.id, { ...row, order_pda: null, publication: "draft" });
    }),
    getListing: async (id) => rows.get(id) ?? null,
    markListed: vi.fn(async (id: string, pda: string) => {
      const row = rows.get(id);
      if (!row || row.publication !== "draft") return false;
      rows.set(id, { ...row, publication: "listed", order_pda: pda });
      return true;
    }),
    getListedByOrder: async (pda) =>
      [...rows.values()].find((r) => r.order_pda === pda && r.publication === "listed") ?? null,
    getSellerInfo: async () => ({ displayName: "Ana", salesCompleted: 4 }),
    createUploadUrls: async (paths) => paths.map((path) => ({ path, signedUrl: `https://up/${path}`, token: "t" })),
    publicUrl: (path) => `https://cdn/${path}`,
    readOrder: async () => onChain,
  };
  api = createListingsApi(deps);
});

async function expectCode(promise: Promise<unknown>, code: string, message?: RegExp) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  if (message) expect((err as ApiError).message).toMatch(message);
}

/** The Order the seller's create_order would leave on-chain for this draft. */
async function orderFor(row: ListingRow, overrides: Partial<OrderAccount> = {}): Promise<OrderAccount> {
  return {
    status: "Created",
    seller: new PublicKey(row.seller_pubkey),
    buyer: null,
    orderId: BigInt(row.order_id),
    mint: Keypair.generate().publicKey,
    amount: BigInt(row.amount_units),
    feeBps: 150,
    disputeDepositBps: 500,
    shipDeadlineSecs: 432_000n,
    claimWindowSecs: 864_000n,
    listingHash: await listingHash({
      title: row.title,
      description: row.description ?? "",
      amount: BigInt(row.amount_units),
      photos: row.photo_paths,
    }),
    trackingHash: null,
    disputeDeposit: 0n,
    createdAt: 1n,
    paidAt: 0n,
    shippedAt: 0n,
    rentPayer: Keypair.generate().publicKey,
    bump: 255,
    ...overrides,
  };
}

const pda = () => orderPda(seller, ORDER_ID).toBase58();

describe("createDraft", () => {
  it("stores a draft, returns the order data and one upload URL per photo", async () => {
    const res = await api.createDraft(sellerUser, draftBody);
    expect(res).toMatchObject({ id: ID, orderId: "123456789", orderPda: pda() });
    expect(res.uploads.map((u) => u.path)).toEqual([`${ID}/1.jpg`, `${ID}/2.webp`]);
    expect(rows.get(ID)).toMatchObject({
      seller_pubkey: seller.toBase58(),
      title: "Campera de cuero",
      amount_units: 45_000_000,
      order_id: 123_456_789,
      listing_hash: res.listingHash,
      publication: "draft",
    });
  });

  it("validates the input with Spanish messages", () => {
    const bad = (patch: object) => () => parseDraftInput({ ...draftBody, ...patch });
    expect(bad({ title: "" })).toThrow(/título/);
    expect(bad({ title: "x".repeat(81) })).toThrow(/título/);
    expect(bad({ description: "x".repeat(1001) })).toThrow(/descripción/);
    expect(bad({ amountUnits: "0" })).toThrow(/precio/);
    expect(bad({ amountUnits: 45 })).toThrow(/precio/);
    expect(bad({ amountUnits: "12.5" })).toThrow(/precio/);
    expect(bad({ photos: [] })).toThrow(/fotos/);
    expect(bad({ photos: new Array(4).fill({ contentType: "image/png" }) })).toThrow(/fotos/);
    expect(bad({ photos: [{ contentType: "image/gif" }] })).toThrow(/JPG/);
    expect(() => parseDraftInput(null)).toThrow(ApiError);
    expect(parseDraftInput({ ...draftBody, description: undefined }).description).toBe("");
  });
});

describe("activate", () => {
  beforeEach(async () => {
    await api.createDraft(sellerUser, draftBody);
  });

  it("lists the publication when the on-chain order matches", async () => {
    onChain = await orderFor(rows.get(ID)!);
    await expect(api.activate(sellerUser, ID, { orderPda: pda() })).resolves.toEqual({ id: ID, orderPda: pda() });
    expect(rows.get(ID)).toMatchObject({ publication: "listed", order_pda: pda() });
    // Retrying is idempotent.
    await expect(api.activate(sellerUser, ID, { orderPda: pda() })).resolves.toEqual({ id: ID, orderPda: pda() });
  });

  it("only lets the owner activate", async () => {
    onChain = await orderFor(rows.get(ID)!);
    await expectCode(api.activate(strangerUser, ID, { orderPda: pda() }), "forbidden");
    await expectCode(api.activate(sellerUser, "nope", { orderPda: pda() }), "not_found");
  });

  it("rejects a PDA that isn't this listing's order", async () => {
    const other = orderPda(seller, ORDER_ID + 1n).toBase58();
    await expectCode(api.activate(sellerUser, ID, { orderPda: other }), "bad_request", /no corresponde/);
    await expectCode(api.activate(sellerUser, ID, { orderPda: "not-a-key" }), "bad_request");
  });

  it("waits for the order to exist on-chain", async () => {
    await expectCode(api.activate(sellerUser, ID, { orderPda: pda() }), "not_found", /Esperá/);
  });

  it("rejects an order whose amount, seller or hash differ", async () => {
    const row = rows.get(ID)!;
    for (const patch of [
      { amount: 45_000_001n },
      { seller: stranger },
      { listingHash: new Uint8Array(32) },
    ] satisfies Partial<OrderAccount>[]) {
      onChain = await orderFor(row, patch);
      await expectCode(api.activate(sellerUser, ID, { orderPda: pda() }), "bad_request", /no coincide/);
    }
    expect(rows.get(ID)!.publication).toBe("draft");
  });

  it("rejects a draft edited after its hash was computed", async () => {
    const row = rows.get(ID)!;
    onChain = await orderFor(row);
    rows.set(ID, { ...row, title: "Otra cosa" });
    await expectCode(api.activate(sellerUser, ID, { orderPda: pda() }), "bad_request", /no coincide/);
  });
});

describe("getByOrder", () => {
  it("returns the listed product with public photo URLs and reputation", async () => {
    await api.createDraft(sellerUser, draftBody);
    onChain = await orderFor(rows.get(ID)!);
    await api.activate(sellerUser, ID, { orderPda: pda() });

    await expect(api.getByOrder(pda())).resolves.toMatchObject({
      listing: {
        title: "Campera de cuero",
        amountUnits: "45000000",
        photoUrls: [`https://cdn/${ID}/1.jpg`, `https://cdn/${ID}/2.webp`],
      },
      seller: { pubkey: seller.toBase58(), displayName: "Ana", salesCompleted: 4 },
    });
  });

  it("hides drafts and unknown links", async () => {
    await api.createDraft(sellerUser, draftBody);
    await expectCode(api.getByOrder(pda()), "not_found", /no existe/);
    await expectCode(api.getByOrder("garbage"), "not_found", /no existe/);
  });
});
