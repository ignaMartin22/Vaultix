/**
 * What a shared link shows before it's opened (W-06): product, price and
 * cover photo. Listed publications are immutable, so this caches well.
 */
import { cacheLife } from "next/cache";

import { ApiError } from "./errors";
import { listingsApi } from "./listings";

export interface ListingMeta {
  title: string;
  amountUnits: string;
  photoUrl: string | null;
}

/** Cached; "not found" is cached as null, other failures throw and aren't cached. */
async function cachedListingMeta(orderPda: string): Promise<ListingMeta | null> {
  "use cache";
  cacheLife("hours");
  try {
    const { listing } = await listingsApi().getByOrder(orderPda);
    return { title: listing.title, amountUnits: listing.amountUnits, photoUrl: listing.photoUrls[0] ?? null };
  } catch (err) {
    if (err instanceof ApiError && err.code === "not_found") return null;
    throw err;
  }
}

/** Null when the link doesn't exist or the backend isn't reachable (mock mode, CI build). */
export async function listingMeta(orderPda: string): Promise<ListingMeta | null> {
  try {
    return await cachedListingMeta(orderPda);
  } catch {
    return null;
  }
}
