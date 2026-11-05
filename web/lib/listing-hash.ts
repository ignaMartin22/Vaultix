/**
 * Canonical `listing_hash` (specs/02-backend.md §2.4): SHA-256 of the listing
 * JSON with keys in a fixed order and no whitespace. The single implementation
 * used by the client (create_order) and the API (activate, dispute panel).
 */
export interface ListingHashInput {
  title: string;
  description: string;
  /** Minimum units. */
  amount: bigint;
  /** Storage paths, in display order. */
  photos: readonly string[];
}

/** The exact string that gets hashed. */
export function canonicalListingJson(listing: ListingHashInput): string {
  // Object literal order is the canonical key order; JSON.stringify adds no spaces.
  return JSON.stringify({
    v: 1,
    title: listing.title,
    description: listing.description,
    amount: listing.amount.toString(),
    photos: [...listing.photos],
  });
}

/** 32 bytes, as stored in `Order.listing_hash`. Works in the browser and Node. */
export async function listingHash(listing: ListingHashInput): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(canonicalListingJson(listing));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

/** Lowercase hex, as stored in `listings.listing_hash`. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listingHashHex(listing: ListingHashInput): Promise<string> {
  return toHex(await listingHash(listing));
}
