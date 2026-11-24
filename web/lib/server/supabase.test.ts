import { describe, expect, it, vi } from "vitest";

import { pingDatabase } from "./supabase";

function fakeDb(result: () => Promise<{ error: { message: string } | null }>) {
  const select = vi.fn(result);
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as Parameters<typeof pingDatabase>[0], from, select };
}

describe("pingDatabase", () => {
  it("runs a head count on listings and reports ok", async () => {
    const { db, from, select } = fakeDb(async () => ({ error: null }));
    await expect(pingDatabase(db)).resolves.toBe("ok");
    expect(from).toHaveBeenCalledWith("listings");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("returns the query error instead of throwing", async () => {
    const { db } = fakeDb(async () => ({ error: { message: "project paused" } }));
    await expect(pingDatabase(db)).resolves.toBe("project paused");
  });

  it("returns a thrown error's message instead of throwing", async () => {
    const { db } = fakeDb(async () => {
      throw new Error("fetch failed");
    });
    await expect(pingDatabase(db)).resolves.toBe("fetch failed");
  });
});
