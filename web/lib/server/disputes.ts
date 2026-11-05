/**
 * Dispute evidence and the arbiter's queue (specs/02-backend.md §2.5, §3; B-09).
 * - Only the buyer and seller upload, only while `Disputed`.
 * - Buyer, seller and arbiter read, through 10-minute signed URLs.
 * - Files go to the private `dispute-evidence` bucket (50 MB, image or mp4/mov).
 */
import { PublicKey } from "@solana/web3.js";

import { listingHashHex, toHex } from "../listing-hash";
import type { ConfigAccount, OrderAccount } from "../vaultix/contract";
import type { AuthUser } from "./auth";
import { readConfig, readOrder, readOrdersByStatus } from "./chain";
import { ApiError } from "./errors";
import { PHOTOS_BUCKET, type ListingRow } from "./listings";
import type { Shipment, ShippingInfo } from "./shipping";
import { supabaseAdmin } from "./supabase";

export const EVIDENCE_BUCKET = "dispute-evidence";
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
export const MAX_NOTE = 2000;
export const SIGNED_URL_SECS = 600;

const FILE_TYPES: Record<string, { kind: "photo" | "video"; ext: string }> = {
  "image/jpeg": { kind: "photo", ext: "jpg" },
  "image/png": { kind: "photo", ext: "png" },
  "image/webp": { kind: "photo", ext: "webp" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
};

export interface EvidenceRow {
  id: string;
  order_pda: string;
  uploader_pubkey: string;
  kind: "photo" | "video" | "note";
  storage_path: string | null;
  note: string | null;
  created_at: string;
}

export interface DisputesDeps {
  newId(): string;
  readOrder(address: PublicKey): Promise<OrderAccount | null>;
  readConfig(): Promise<ConfigAccount | null>;
  readDisputedOrders(): Promise<{ address: PublicKey; account: OrderAccount }[]>;
  insertEvidence(row: Omit<EvidenceRow, "created_at">): Promise<void>;
  listEvidence(orderPdas: string[]): Promise<EvidenceRow[]>;
  createUploadUrl(path: string): Promise<{ signedUrl: string; token: string; path: string }>;
  /** Signed read URLs by path; missing objects are left out. */
  signedUrls(paths: string[], expiresIn: number): Promise<Map<string, string>>;
  listingsByOrder(orderPdas: string[]): Promise<ListingRow[]>;
  publicPhotoUrl(path: string): string;
  shipments(orderPdas: string[]): Promise<Map<string, Shipment>>;
  shippingInfo(pairs: { orderPda: string; buyer: string }[]): Promise<Map<string, ShippingInfo>>;
}

function bad(message: string): never {
  throw new ApiError("bad_request", message);
}

function parsePda(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new ApiError("not_found", "Esta orden no existe.");
  }
}

const has = (user: AuthUser, key: PublicKey | null) => key !== null && user.solanaPubkeys.includes(key.toBase58());

export type EvidenceInput =
  | { kind: "note"; note: string }
  | { kind: "photo" | "video"; contentType: string; ext: string; note: string | null };

export function parseEvidenceInput(body: unknown): EvidenceInput {
  if (typeof body !== "object" || body === null) bad("Faltan datos.");
  const b = body as Record<string, unknown>;
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) bad(`La nota puede tener hasta ${MAX_NOTE} caracteres.`);

  if (b.kind === "note") {
    if (!note) bad("Escribí qué pasó.");
    return { kind: "note", note };
  }
  if (b.kind !== "photo" && b.kind !== "video") bad("Subí una foto, un video o una nota.");
  const type = typeof b.contentType === "string" ? FILE_TYPES[b.contentType] : undefined;
  if (!type || type.kind !== b.kind) bad("Las fotos tienen que ser JPG, PNG o WebP, y los videos MP4 o MOV.");
  if (typeof b.size !== "number" || b.size <= 0 || b.size > MAX_EVIDENCE_BYTES) bad("El archivo puede pesar hasta 50 MB.");
  return { kind: type.kind, contentType: b.contentType as string, ext: type.ext, note: note || null };
}

export function createDisputesApi(deps: DisputesDeps) {
  async function order(pda: PublicKey) {
    const o = await deps.readOrder(pda);
    if (!o) throw new ApiError("not_found", "Esta orden no existe.");
    return o;
  }

  async function isArbiter(user: AuthUser): Promise<boolean> {
    const config = await deps.readConfig();
    return config !== null && has(user, config.arbiter);
  }

  async function signEvidence(rows: EvidenceRow[]) {
    const paths = rows.flatMap((r) => (r.storage_path ? [r.storage_path] : []));
    const urls = paths.length > 0 ? await deps.signedUrls(paths, SIGNED_URL_SECS) : new Map<string, string>();
    return rows
      // A file row whose upload never finished has nothing to show.
      .filter((r) => !r.storage_path || urls.has(r.storage_path))
      .map((r) => ({
        id: r.id,
        orderPda: r.order_pda,
        uploader: r.uploader_pubkey,
        kind: r.kind,
        note: r.note,
        url: r.storage_path ? urls.get(r.storage_path)! : null,
        createdAt: r.created_at,
      }));
  }

  /** `POST /api/disputes/:pda/evidence` */
  async function addEvidence(user: AuthUser, pdaParam: string, body: unknown) {
    const pda = parsePda(pdaParam);
    const input = parseEvidenceInput(body);
    const o = await order(pda);
    if (!has(user, o.buyer) && !has(user, o.seller)) throw new ApiError("forbidden");
    if (o.status !== "Disputed") throw new ApiError("forbidden", "Solo se sube evidencia mientras hay un reclamo abierto.");

    const id = deps.newId();
    const storagePath = input.kind === "note" ? null : `${pda.toBase58()}/${id}.${input.ext}`;
    const upload = storagePath ? await deps.createUploadUrl(storagePath) : undefined;
    await deps.insertEvidence({
      id,
      order_pda: pda.toBase58(),
      uploader_pubkey: user.pubkey,
      kind: input.kind,
      storage_path: storagePath,
      note: input.note,
    });
    return { id, ...(upload ? { upload } : {}) };
  }

  /** `GET /api/disputes/:pda/evidence` */
  async function listEvidence(user: AuthUser, pdaParam: string) {
    const pda = parsePda(pdaParam);
    const o = await order(pda);
    if (!has(user, o.buyer) && !has(user, o.seller) && !(await isArbiter(user))) throw new ApiError("forbidden");
    return { items: await signEvidence(await deps.listEvidence([pda.toBase58()])) };
  }

  /** `GET /api/admin/disputes`: every `Disputed` order with product, shipping and evidence. */
  async function adminDisputes(user: AuthUser) {
    // 404, not 403: the panel doesn't exist for anyone but the arbiter (03 §5.6).
    if (!(await isArbiter(user))) throw new ApiError("not_found");
    const disputed = await deps.readDisputedOrders();
    const pdas = disputed.map((d) => d.address.toBase58());
    if (pdas.length === 0) return { disputes: [] };

    const [listings, shipments, shipping, evidence] = await Promise.all([
      deps.listingsByOrder(pdas),
      deps.shipments(pdas),
      deps.shippingInfo(
        disputed.flatMap((d) => (d.account.buyer ? [{ orderPda: d.address.toBase58(), buyer: d.account.buyer.toBase58() }] : [])),
      ),
      deps.listEvidence(pdas).then(signEvidence),
    ]);

    const disputes = await Promise.all(
      disputed.map(async ({ address, account: o }) => {
        const pda = address.toBase58();
        const listing = listings.find((l) => l.order_pda === pda) ?? null;
        // The arbiter checks the product shown is the one the buyer paid for.
        const listingVerified =
          listing !== null &&
          (await listingHashHex({
            title: listing.title,
            description: listing.description ?? "",
            amount: BigInt(listing.amount_units),
            photos: listing.photo_paths,
          })) === toHex(o.listingHash);
        return {
          orderPda: pda,
          order: {
            seller: o.seller.toBase58(),
            buyer: o.buyer?.toBase58() ?? null,
            amountUnits: o.amount.toString(),
            feeBps: o.feeBps,
            disputeDepositUnits: o.disputeDeposit.toString(),
            paidAt: Number(o.paidAt),
            shippedAt: Number(o.shippedAt),
            trackingHash: o.trackingHash ? toHex(o.trackingHash) : null,
          },
          listing: listing
            ? {
                title: listing.title,
                description: listing.description ?? "",
                photoUrls: listing.photo_paths.map((p) => deps.publicPhotoUrl(p)),
                verified: listingVerified,
              }
            : null,
          shipment: shipments.get(pda) ?? null,
          shipping: shipping.get(pda) ?? null,
          evidence: evidence.filter((e) => e.orderPda === pda),
        };
      }),
    );
    return { disputes };
  }

  return { addEvidence, listEvidence, adminDisputes };
}

// ---------------------------------------------------------------------------
// Default (Supabase + devnet) dependencies
// ---------------------------------------------------------------------------


function defaultDeps(): DisputesDeps {
  const db = supabaseAdmin();
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`, { cause: error });
  };
  return {
    newId: () => crypto.randomUUID(),
    readOrder,
    readConfig,
    readDisputedOrders: () => readOrdersByStatus("Disputed"),
    async insertEvidence(row) {
      const { error } = await db.from("dispute_evidence").insert(row);
      if (error) fail("dispute_evidence insert", error);
    },
    async listEvidence(orderPdas) {
      const { data, error } = await db
        .from("dispute_evidence")
        .select("id, order_pda, uploader_pubkey, kind, storage_path, note, created_at")
        .in("order_pda", orderPdas)
        .order("created_at", { ascending: true });
      if (error) fail("dispute_evidence select", error);
      return (data ?? []) as EvidenceRow[];
    },
    async createUploadUrl(path) {
      const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return fail("evidence upload url", error ?? { message: "no data" });
      return { signedUrl: data.signedUrl, token: data.token, path: data.path };
    },
    async signedUrls(paths, expiresIn) {
      const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, expiresIn);
      if (error) fail("evidence signed urls", error);
      const urls = new Map<string, string>();
      for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
      return urls;
    },
    async listingsByOrder(orderPdas) {
      const { data, error } = await db
        .from("listings")
        .select("id, seller_pubkey, title, description, photo_paths, amount_units, order_id, order_pda, listing_hash, publication")
        .in("order_pda", orderPdas);
      if (error) fail("listings by order", error);
      return data ?? [];
    },
    publicPhotoUrl: (path) => db.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl,
    async shipments(orderPdas) {
      const { data, error } = await db.from("shipments").select("order_pda, carrier, tracking_number").in("order_pda", orderPdas);
      if (error) fail("shipments", error);
      return new Map(
        (data ?? []).map((s) => [s.order_pda, { carrier: s.carrier, tracking_number: s.tracking_number } as Shipment]),
      );
    },
    async shippingInfo(pairs) {
      const result = new Map<string, ShippingInfo>();
      if (pairs.length === 0) return result;
      const { data, error } = await db
        .from("shipping_info")
        .select("order_pda, buyer_pubkey, full_name, phone, street, city, province, postal_code, notes")
        .in("order_pda", pairs.map((p) => p.orderPda));
      if (error) fail("shipping_info", error);
      for (const row of data ?? []) {
        // Only the address of whoever actually paid.
        if (pairs.some((p) => p.orderPda === row.order_pda && p.buyer === row.buyer_pubkey)) {
          const { order_pda, buyer_pubkey, ...info } = row;
          void buyer_pubkey;
          result.set(order_pda, info);
        }
      }
      return result;
    },
  };
}

let api: ReturnType<typeof createDisputesApi> | undefined;

export function disputesApi() {
  api ??= createDisputesApi(defaultDeps());
  return api;
}
