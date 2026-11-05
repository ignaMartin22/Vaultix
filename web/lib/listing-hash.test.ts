import { describe, expect, it } from "vitest";

import { canonicalListingJson, listingHash, listingHashHex } from "./listing-hash";

const LISTING = {
  title: "Campera de cuero",
  description: "Talle M, poco uso",
  amount: 45_000_000n,
  photos: ["listings/abc/1.jpg", "listings/abc/2.jpg"],
};

describe("listing hash", () => {
  it("serializes with the canonical key order and no spaces", () => {
    expect(canonicalListingJson(LISTING)).toBe(
      '{"v":1,"title":"Campera de cuero","description":"Talle M, poco uso","amount":"45000000","photos":["listings/abc/1.jpg","listings/abc/2.jpg"]}',
    );
  });

  it("matches a known SHA-256 vector (computed with sha256sum)", async () => {
    expect(await listingHashHex(LISTING)).toBe(
      "85aea6d1293b5da15e3fc38ee4ca7660118e19906b45f0bfc400f72c37390cc5",
    );
    expect((await listingHash(LISTING)).length).toBe(32);
  });

  it("does not depend on the input object's key order", async () => {
    const shuffled = {
      photos: LISTING.photos,
      amount: LISTING.amount,
      description: LISTING.description,
      title: LISTING.title,
    };
    expect(await listingHashHex(shuffled)).toBe(await listingHashHex(LISTING));
  });

  it("changes when any field or the photo order changes", async () => {
    const base = await listingHashHex(LISTING);
    const variants = [
      { ...LISTING, title: "Campera de cuero " },
      { ...LISTING, amount: 45_000_001n },
      { ...LISTING, photos: [...LISTING.photos].reverse() },
    ];
    for (const v of variants) expect(await listingHashHex(v)).not.toBe(base);
  });
});
