import { Keypair, type PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it } from "vitest";

import { listingHash } from "../listing-hash";
import { DEFAULT_PROTOCOL, type OrderAccount, type OrderStatus } from "../vaultix/contract";
import type { AuthUser } from "./auth";
import { createDisputesApi, parseEvidenceInput, type DisputesDeps, type EvidenceRow } from "./disputes";
import { ApiError } from "./errors";
import type { ListingRow } from "./listings";

const k = { seller: Keypair.generate(), buyer: Keypair.generate(), arbiter: Keypair.generate(), other: Keypair.generate() };
const asUser = (kp: Keypair): AuthUser => ({
  privyUserId: kp.publicKey.toBase58(),
  pubkey: kp.publicKey.toBase58(),
  solanaPubkeys: [kp.publicKey.toBase58()],
  email: null,
});
const seller = asUser(k.seller);
const buyer = asUser(k.buyer);
const arbiter = asUser(k.arbiter);
const other = asUser(k.other);
const pda = Keypair.generate().publicKey;

const listing: ListingRow = {
  id: "l1",
  seller_pubkey: seller.pubkey,
  title: "Campera",
  description: "Talle M",
  photo_paths: ["l1/1.jpg"],
  amount_units: 45_000_000,
  order_id: 7,
  order_pda: pda.toBase58(),
  listing_hash: null,
  publication: "listed",
};

let status: OrderStatus;
let orderHash: Uint8Array;
let rows: EvidenceRow[];
let uploaded: Set<string>;
let api: ReturnType<typeof createDisputesApi>;
let ids = 0;

function order(): OrderAccount {
  return {
    status,
    seller: k.seller.publicKey,
    buyer: k.buyer.publicKey,
    orderId: 7n,
    mint: Keypair.generate().publicKey,
    amount: 45_000_000n,
    feeBps: 150,
    disputeDepositBps: 500,
    shipDeadlineSecs: 432_000n,
    claimWindowSecs: 864_000n,
    listingHash: orderHash,
    trackingHash: null,
    disputeDeposit: 2_250_000n,
    createdAt: 1n,
    paidAt: 2n,
    shippedAt: 3n,
    rentPayer: k.seller.publicKey,
    bump: 255,
  };
}

beforeEach(async () => {
  status = "Disputed";
  orderHash = await listingHash({ title: "Campera", description: "Talle M", amount: 45_000_000n, photos: ["l1/1.jpg"] });
  rows = [];
  uploaded = new Set();
  const deps: DisputesDeps = {
    newId: () => `e${++ids}`,
    readOrder: async (p: PublicKey) => (p.equals(pda) ? order() : null),
    readConfig: async () => ({
      admin: k.arbiter.publicKey,
      arbiter: k.arbiter.publicKey,
      treasury: Keypair.generate().publicKey,
      allowedMint: Keypair.generate().publicKey,
      ...DEFAULT_PROTOCOL,
      bump: 255,
    }),
    readDisputedOrders: async () => (status === "Disputed" ? [{ address: pda, account: order() }] : []),
    insertEvidence: async (row) => void rows.push({ ...row, created_at: new Date(ids).toISOString() }),
    listEvidence: async (pdas) => rows.filter((r) => pdas.includes(r.order_pda)),
    createUploadUrl: async (path) => ({ path, signedUrl: `https://up/${path}`, token: "t" }),
    signedUrls: async (paths) => new Map(paths.filter((p) => uploaded.has(p)).map((p) => [p, `https://read/${p}`])),
    listingsByOrder: async () => [listing],
    publicPhotoUrl: (p) => `https://cdn/${p}`,
    shipments: async () => new Map([[pda.toBase58(), { carrier: "oca" as const, tracking_number: "X123" }]]),
    shippingInfo: async () => new Map(),
  };
  api = createDisputesApi(deps);
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
}

const photo = { kind: "photo", contentType: "image/jpeg", size: 1_000 };

describe("parseEvidenceInput", () => {
  it("accepts notes, photos and videos within the limits", () => {
    expect(parseEvidenceInput({ kind: "note", note: " Llegó roto " })).toEqual({ kind: "note", note: "Llegó roto" });
    expect(parseEvidenceInput({ ...photo, note: "" })).toMatchObject({ kind: "photo", ext: "jpg", note: null });
    expect(parseEvidenceInput({ kind: "video", contentType: "video/quicktime", size: 5 })).toMatchObject({ ext: "mov" });
  });

  it("rejects wrong types, sizes and empty notes", () => {
    expect(() => parseEvidenceInput({ kind: "note", note: "  " })).toThrow(/Escribí/);
    expect(() => parseEvidenceInput({ ...photo, contentType: "image/gif" })).toThrow(/JPG/);
    expect(() => parseEvidenceInput({ kind: "photo", contentType: "video/mp4", size: 1 })).toThrow(/JPG/);
    expect(() => parseEvidenceInput({ ...photo, size: 50 * 1024 * 1024 + 1 })).toThrow(/50 MB/);
    expect(() => parseEvidenceInput({ kind: "audio" })).toThrow();
  });
});

describe("evidence access", () => {
  it("lets buyer and seller upload while Disputed, with a signed upload URL for files", async () => {
    const res = await api.addEvidence(buyer, pda.toBase58(), photo);
    expect(res).toMatchObject({ id: "e1", upload: { signedUrl: `https://up/${pda.toBase58()}/e1.jpg` } });
    await expect(api.addEvidence(seller, pda.toBase58(), { kind: "note", note: "Salió bien" })).resolves.not.toHaveProperty("upload");
    expect(rows.map((r) => r.uploader_pubkey)).toEqual([buyer.pubkey, seller.pubkey]);
  });

  it("denies the arbiter and strangers uploading, and any upload outside a dispute", async () => {
    await expectCode(api.addEvidence(arbiter, pda.toBase58(), photo), "forbidden");
    await expectCode(api.addEvidence(other, pda.toBase58(), photo), "forbidden");
    status = "Shipped";
    await expectCode(api.addEvidence(buyer, pda.toBase58(), photo), "forbidden");
  });

  it("lists for buyer, seller and arbiter only, hiding files that never got uploaded", async () => {
    await api.addEvidence(buyer, pda.toBase58(), photo); // e.. uploaded below
    await api.addEvidence(seller, pda.toBase58(), photo); // never uploaded
    await api.addEvidence(seller, pda.toBase58(), { kind: "note", note: "Comprobante adjunto" });
    uploaded.add(rows[0].storage_path!);

    for (const u of [buyer, seller, arbiter]) {
      const { items } = await api.listEvidence(u, pda.toBase58());
      expect(items.map((i) => i.kind)).toEqual(["photo", "note"]);
      expect(items[0].url).toBe(`https://read/${rows[0].storage_path}`);
    }
    await expectCode(api.listEvidence(other, pda.toBase58()), "forbidden");
    await expectCode(api.listEvidence(buyer, "garbage"), "not_found");
  });
});

describe("adminDisputes", () => {
  it("is a 404 for anyone but the arbiter", async () => {
    for (const u of [buyer, seller, other]) await expectCode(api.adminDisputes(u), "not_found");
  });

  it("returns each dispute with product (hash-verified), tracking and evidence", async () => {
    await api.addEvidence(buyer, pda.toBase58(), { kind: "note", note: "No llegó" });
    const { disputes } = await api.adminDisputes(arbiter);
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({
      orderPda: pda.toBase58(),
      order: { amountUnits: "45000000", disputeDepositUnits: "2250000", buyer: buyer.pubkey },
      listing: { title: "Campera", photoUrls: ["https://cdn/l1/1.jpg"], verified: true },
      shipment: { carrier: "oca", tracking_number: "X123" },
    });
    expect(disputes[0].evidence.map((e) => e.note)).toEqual(["No llegó"]);
  });

  it("flags a listing that doesn't match what was paid for", async () => {
    orderHash = new Uint8Array(32);
    const { disputes } = await api.adminDisputes(arbiter);
    expect(disputes[0].listing?.verified).toBe(false);
  });

  it("is empty when nothing is disputed", async () => {
    status = "Shipped";
    await expect(api.adminDisputes(arbiter)).resolves.toEqual({ disputes: [] });
  });
});

