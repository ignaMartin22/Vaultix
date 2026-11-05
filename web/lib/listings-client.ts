/**
 * Browser side of the listings API (01 §5.2): draft → photo uploads → activate.
 * In mock mode the draft is computed locally with the same rules as the API,
 * so `/sell` works without Supabase.
 */
import { PublicKey } from "@solana/web3.js";

import { apiFetch, type GetAccessToken } from "./api";
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
