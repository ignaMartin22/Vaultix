/**
 * Browser side of the listings API (01 §5.2): draft → photo uploads → activate.
 * In mock mode the draft is computed locally with the same rules as the API,
 * so `/sell` works without Supabase.
 */
import { PublicKey } from "@solana/web3.js";

import { apiFetch, ApiClientError, type GetAccessToken } from "./api";
import { listingHash } from "./listing-hash";
import { USE_MOCK } from "./vaultix/mode";
import { orderPda } from "./vaultix/pdas";

export interface DraftInput {
  title: string;
  description: string;
  amount: bigint;
  photos: File[];
}

export interface UploadTicket {
  path: string;
  signedUrl: string;
  token: string;
}

export interface Draft {
  id: string;
  orderId: bigint;
  orderPda: PublicKey;
  listingHash: Uint8Array;
  uploads: UploadTicket[];
}

interface DraftResponse {
  id: string;
  orderId: string;
  orderPda: string;
  listingHash: string;
  uploads: UploadTicket[];
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
}

/** Same extension rule as the API, for mock paths. */
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function randomU53(): bigint {
  const [hi, lo] = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(hi & 0x1f_ffff) << 32n) | BigInt(lo);
}

export async function createDraft(
  input: DraftInput,
  seller: PublicKey,
  getAccessToken: GetAccessToken,
): Promise<Draft> {
  if (USE_MOCK) {
    const id = crypto.randomUUID();
    const orderId = randomU53();
    const photos = input.photos.map((f, i) => `${id}/${i + 1}.${EXT[f.type] ?? "jpg"}`);
    return {
      id,
      orderId,
      orderPda: orderPda(seller, orderId),
      listingHash: await listingHash({ ...input, photos }),
      uploads: [],
    };
  }

  const res = await apiFetch<DraftResponse>("/api/listings", {
    method: "POST",
    getAccessToken,
    body: {
      title: input.title,
      description: input.description,
      amountUnits: input.amount.toString(),
      photos: input.photos.map((f) => ({ contentType: f.type })),
    },
  });
  return {
    id: res.id,
    orderId: BigInt(res.orderId),
    orderPda: new PublicKey(res.orderPda),
    listingHash: fromHex(res.listingHash),
    uploads: res.uploads,
  };
}

/** PUTs each photo to its signed upload URL (the same request supabase-js makes). */
export async function uploadPhotos(uploads: UploadTicket[], photos: File[]): Promise<void> {
  await Promise.all(
    uploads.map(async (ticket, i) => {
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", photos[i]);
      const res = await fetch(ticket.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
      if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
    }),
  );
}

export async function activateListing(
  draft: Draft,
  getAccessToken: GetAccessToken,
): Promise<void> {
  if (USE_MOCK) return;
  await apiFetch(`/api/listings/${draft.id}/activate`, {
    method: "POST",
    getAccessToken,
    body: { orderPda: draft.orderPda.toBase58() },
  });
}

/** The public link of an order: `/p/<orderPda>`. */
export function paymentLink(origin: string, orderPda: PublicKey): string {
  return `${origin}/p/${orderPda.toBase58()}`;
}

// ---------------------------------------------------------------------------
// Public view of a link (`/p/[orderId]`) and the buyer's shipping address
// ---------------------------------------------------------------------------

export interface PublicListing {
  listing: {
    id: string;
    orderPda: string;
    title: string;
    description: string;
    amountUnits: string;
    photoUrls: string[];
    listingHash: string | null;
  };
  seller: { pubkey: string; displayName: string | null; salesCompleted: number };
}

/** Mock mode: listings activated in this tab, so `/p` can show them. */
const mockListings = new Map<string, PublicListing>();

export function rememberMockListing(draft: Draft, input: DraftInput, seller: PublicKey): void {
  mockListings.set(draft.orderPda.toBase58(), {
    listing: {
      id: draft.id,
      orderPda: draft.orderPda.toBase58(),
      title: input.title,
      description: input.description,
      amountUnits: input.amount.toString(),
      photoUrls: input.photos.map((f) => URL.createObjectURL(f)),
      listingHash: null,
    },
    seller: { pubkey: seller.toBase58(), displayName: null, salesCompleted: 0 },
  });
}

/** `null` when the link doesn't exist or isn't listed. */
export async function getListingByOrder(orderPda: string): Promise<PublicListing | null> {
  if (USE_MOCK) return mockListings.get(orderPda) ?? null;
  try {
    return await apiFetch<PublicListing>(`/api/listings/by-order/${encodeURIComponent(orderPda)}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.code === "not_found") return null;
    throw err;
  }
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
}

const mockShipping = new Map<string, ShippingAddress>();

export async function saveShippingAddress(
  orderPda: string,
  address: ShippingAddress,
  getAccessToken: GetAccessToken,
): Promise<void> {
  if (USE_MOCK) {
    mockShipping.set(orderPda, address);
    return;
  }
  await apiFetch("/api/shipping", { method: "POST", getAccessToken, body: { orderPda, ...address } });
}

/** Mock mode only: the address saved for an order in this tab (what the seller sees). */
export function mockShippingAddress(orderPda: string): ShippingAddress | null {
  return mockShipping.get(orderPda) ?? null;
}
