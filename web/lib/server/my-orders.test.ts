import { describe, expect, it, vi } from "vitest";

import type { AuthUser } from "./auth";
import { createMyOrders, type MyOrdersDeps } from "./my-orders";

const user: AuthUser = { privyUserId: "u", pubkey: "EXT", solanaPubkeys: ["EXT", "EMB"], email: null };

function deps(overrides: Partial<MyOrdersDeps> = {}): MyOrdersDeps {
  return {
    sales: vi.fn(async () => [
      { orderPda: "S1", at: "2026-11-01T10:00:00.000Z" },
      { orderPda: "S2", at: "2026-11-03T10:00:00.000Z" },
    ]),
    purchases: vi.fn(async () => [
      { orderPda: "P1", at: "2026-11-02T10:00:00.000Z" },
      { orderPda: "P1", at: "2026-11-02T10:00:00.000Z" },
    ]),
    listings: async () =>
      new Map([
        ["S1", { title: "Campera", amountUnits: "45000000", photoPath: "l1/1.jpg" }],
        ["P1", { title: "Bici", amountUnits: "320000000", photoPath: null }],
      ]),
    publicPhotoUrl: (p) => `https://cdn/${p}`,
    ...overrides,
  };
}

describe("GET /api/me/orders", () => {
  it("returns sales and purchases newest first, with the product and no status", async () => {
    const d = deps();
    const res = await createMyOrders(d)(user);
    expect(res.sales.map((o) => o.orderPda)).toEqual(["S2", "S1"]);
    expect(res.sales[1]).toEqual({
      orderPda: "S1",
      role: "seller",
      title: "Campera",
      amountUnits: "45000000",
      photoUrl: "https://cdn/l1/1.jpg",
      at: "2026-11-01T10:00:00.000Z",
    });
    expect(res.sales[0]).toMatchObject({ title: null, amountUnits: null, photoUrl: null });
    expect(res.purchases).toEqual([
      { orderPda: "P1", role: "buyer", title: "Bici", amountUnits: "320000000", photoUrl: null, at: "2026-11-02T10:00:00.000Z" },
    ]);
    expect(res.sales[0]).not.toHaveProperty("status");
  });

  it("looks up every Solana account of the user (Phantom and embedded)", async () => {
    const d = deps();
    await createMyOrders(d)(user);
    expect(d.sales).toHaveBeenCalledWith(["EXT", "EMB"]);
    expect(d.purchases).toHaveBeenCalledWith(["EXT", "EMB"]);
  });

  it("is empty for a new user without touching listings", async () => {
    const listings = vi.fn(async () => new Map());
    const res = await createMyOrders(deps({ sales: async () => [], purchases: async () => [], listings }))(user);
    expect(res).toEqual({ sales: [], purchases: [] });
    expect(listings).not.toHaveBeenCalled();
  });
});
