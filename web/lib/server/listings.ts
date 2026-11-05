/**
 * Listings API logic (specs/02-backend.md §2.2, §2.5, §3; 01 §5.2):
 * draft + signed photo uploads → on-chain `create_order` → activate → public.
 *
 * `order_id` is a random integer below 2^53: still a valid u64, and it stays
 * exact through PostgREST/JSON numbers (which `numeric` columns come back as).
 */
import { PublicKey } from "@solana/web3.js";

import { listingHashHex, toHex } from "../listing-hash";
import type { OrderAccount } from "../vaultix/contract";
import { orderPda } from "../vaultix/pdas";
import type { AuthUser } from "./auth";
import { readOrder } from "./chain";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";

export const PHOTOS_BUCKET = "listing-photos";
export const MAX_PHOTOS = 3;
export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 1000;

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ListingRow {
  id: string;
  seller_pubkey: string;
  title: string;
  description: string | null;
  photo_paths: string[];
  amount_units: number;
  order_id: number;
  order_pda: string | null;
  listing_hash: string | null;
  publication: string;
}

export interface UploadTicket {
  path: string;
  signedUrl: string;
  token: string;
}

export interface ListingDeps {
  newId(): string;
  randomOrderId(): bigint;
  insertDraft(row: Omit<ListingRow, "order_pda" | "publication">): Promise<void>;
  getListing(id: string): Promise<ListingRow | null>;
  /** Sets `listed` + `order_pda` only if still a draft; returns whether it did. */
  markListed(id: string, orderPda: string): Promise<boolean>;
  getListedByOrder(orderPda: string): Promise<ListingRow | null>;
  getSellerInfo(pubkey: string): Promise<{ displayName: string | null; salesCompleted: number }>;
  createUploadUrls(paths: string[]): Promise<UploadTicket[]>;
  publicUrl(path: string): string;
  readOrder(address: PublicKey): Promise<OrderAccount | null>;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function bad(message: string): never {
  throw new ApiError("bad_request", message);
}

function record(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) bad("Faltan datos.");
  return body as Record<string, unknown>;
}

export interface DraftInput {
  title: string;
  description: string;
  amount: bigint;
  photoTypes: string[];
}

export function parseDraftInput(body: unknown): DraftInput {
  const b = record(body);
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 1 || title.length > MAX_TITLE) bad(`El título tiene que tener entre 1 y ${MAX_TITLE} caracteres.`);

  const description = b.description === undefined || b.description === null ? "" : b.description;
  if (typeof description !== "string" || description.length > MAX_DESCRIPTION) {
    bad(`La descripción puede tener hasta ${MAX_DESCRIPTION} caracteres.`);
  }

  if (typeof b.amountUnits !== "string" || !/^\d{1,20}$/.test(b.amountUnits)) bad("El precio no es válido.");
  const amount = BigInt(b.amountUnits);
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) bad("El precio no es válido.");

  if (!Array.isArray(b.photos) || b.photos.length < 1 || b.photos.length > MAX_PHOTOS) {
    bad(`Subí entre 1 y ${MAX_PHOTOS} fotos.`);
  }
  const photoTypes = b.photos.map((p) => {
    const type = typeof p === "object" && p !== null ? (p as Record<string, unknown>).contentType : undefined;
    if (typeof type !== "string" || !(type in PHOTO_TYPES)) bad("Las fotos tienen que ser JPG, PNG o WebP.");
    return type;
  });

  return { title, description, amount, photoTypes };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createListingsApi(deps: ListingDeps) {
  async function createDraft(user: AuthUser, body: unknown) {
    const input = parseDraftInput(body);
    const id = deps.newId();
    const orderId = deps.randomOrderId();
    const photoPaths = input.photoTypes.map((type, i) => `${id}/${i + 1}.${PHOTO_TYPES[type]}`);
    const listingHash = await listingHashHex({
      title: input.title,
      description: input.description,
      amount: input.amount,
      photos: photoPaths,
    });

    await deps.insertDraft({
      id,
      seller_pubkey: user.pubkey,
      title: input.title,
      description: input.description,
      photo_paths: photoPaths,
      amount_units: Number(input.amount),
      order_id: Number(orderId),
      listing_hash: listingHash,
    });
    const uploads = await deps.createUploadUrls(photoPaths);

    return {
      id,
      orderId: orderId.toString(),
      orderPda: orderPda(new PublicKey(user.pubkey), orderId).toBase58(),
      listingHash,
      uploads,
    };
  }

  async function activate(user: AuthUser, id: string, body: unknown) {
    const b = record(body);
    let pda: PublicKey;
    try {
      pda = new PublicKey(String(b.orderPda ?? ""));
    } catch {
      bad("Falta la orden.");
    }

    const listing = await deps.getListing(id);
    if (!listing) throw new ApiError("not_found");
    if (!user.solanaPubkeys.includes(listing.seller_pubkey)) throw new ApiError("forbidden");

    const seller = new PublicKey(listing.seller_pubkey);
    const expected = orderPda(seller, BigInt(listing.order_id));
    if (!expected.equals(pda)) bad("El link no corresponde a esta publicación.");

    if (listing.publication === "listed") {
      // Retrying a successful activation is fine; anything else is not.
      if (listing.order_pda === pda.toBase58()) return { id, orderPda: listing.order_pda };
      bad("Esta publicación ya está activa.");
    }

    const order = await deps.readOrder(pda);
    if (!order) {
      throw new ApiError("not_found", "Todavía no encontramos tu link. Esperá unos segundos y probá de nuevo.");
    }

    // The row itself must still hash to what was stored (immutable once listed).
    const rowHash = await listingHashHex({
      title: listing.title,
      description: listing.description ?? "",
      amount: BigInt(listing.amount_units),
      photos: listing.photo_paths,
    });
    if (
      !order.seller.equals(seller) ||
      order.amount !== BigInt(listing.amount_units) ||
      toHex(order.listingHash) !== listing.listing_hash ||
      rowHash !== listing.listing_hash
    ) {
      bad("La orden no coincide con la publicación.");
    }

    if (!(await deps.markListed(id, pda.toBase58()))) bad("Esta publicación ya está activa.");
    return { id, orderPda: pda.toBase58() };
  }

  async function getByOrder(pdaParam: string) {
    const notFound = () => new ApiError("not_found", "Este link no existe o ya no está disponible.");
    try {
      new PublicKey(pdaParam);
    } catch {
      throw notFound();
    }
    const listing = await deps.getListedByOrder(pdaParam);
    if (!listing) throw notFound();
    const seller = await deps.getSellerInfo(listing.seller_pubkey);
    return {
      listing: {
        id: listing.id,
        orderPda: pdaParam,
        title: listing.title,
        description: listing.description ?? "",
        amountUnits: String(listing.amount_units),
        photoUrls: listing.photo_paths.map((p) => deps.publicUrl(p)),
        listingHash: listing.listing_hash,
      },
      seller: { pubkey: listing.seller_pubkey, ...seller },
    };
  }

  return { createDraft, activate, getByOrder };
}

// ---------------------------------------------------------------------------
// Default (Supabase + devnet) dependencies
// ---------------------------------------------------------------------------

function randomU53(): bigint {
  const [hi, lo] = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(hi & 0x1f_ffff) << 32n) | BigInt(lo);
}

const LISTING_COLUMNS =
  "id, seller_pubkey, title, description, photo_paths, amount_units, order_id, order_pda, listing_hash, publication";

function defaultDeps(): ListingDeps {
  const db = supabaseAdmin();
  const fail = (what: string, error: { message: string }) => {
    throw new Error(`${what}: ${error.message}`, { cause: error });
  };

  return {
    newId: () => crypto.randomUUID(),
    randomOrderId: randomU53,
    async insertDraft(row) {
      const { error } = await db.from("listings").insert({ ...row, publication: "draft" });
      if (error) fail("listings insert", error);
    },
    async getListing(id) {
      const { data, error } = await db.from("listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle();
      if (error) fail("listings select", error);
      return data;
    },
    async markListed(id, pda) {
      const { data, error } = await db
        .from("listings")
        .update({ publication: "listed", order_pda: pda })
        .eq("id", id)
        .eq("publication", "draft")
        .select("id");
      if (error) fail("listings update", error);
      return (data ?? []).length === 1;
    },
    async getListedByOrder(pda) {
      const { data, error } = await db
        .from("listings")
        .select(LISTING_COLUMNS)
        .eq("order_pda", pda)
        .eq("publication", "listed")
        .maybeSingle();
      if (error) fail("listings by order", error);
      return data;
    },
    async getSellerInfo(pubkey) {
      const [rep, profile] = await Promise.all([
        db.from("reputation").select("sales_completed").eq("pubkey", pubkey).maybeSingle(),
        db.from("profiles").select("display_name").eq("wallet_pubkey", pubkey).maybeSingle(),
      ]);
      if (rep.error) fail("reputation", rep.error);
      if (profile.error) fail("profiles", profile.error);
      return {
        displayName: profile.data?.display_name ?? null,
        salesCompleted: rep.data?.sales_completed ?? 0,
      };
    },
    async createUploadUrls(paths) {
      return Promise.all(
        paths.map(async (path) => {
          const { data, error } = await db.storage.from(PHOTOS_BUCKET).createSignedUploadUrl(path);
          if (error) fail("signed upload url", error);
          return { path: data!.path, signedUrl: data!.signedUrl, token: data!.token };
        }),
      );
    },
    publicUrl: (path) => db.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl,
    readOrder,
  };
}

let api: ReturnType<typeof createListingsApi> | undefined;

export function listingsApi() {
  api ??= createListingsApi(defaultDeps());
  return api;
}
