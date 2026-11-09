import { describe, expect, it, vi } from "vitest";

import { WITHDRAW_DAILY_LIMIT } from "../withdraw";
import { readWithdrawalsToday } from "./withdrawals";

const NOW = new Date("2026-11-09T22:30:00Z");

describe("readWithdrawalsToday", () => {
  it("reads the user's withdrawal counter for the UTC day", async () => {
    const readUsage = vi.fn(async () => 2);
    await expect(readWithdrawalsToday("did:privy:ana", readUsage, NOW)).resolves.toEqual({
      used: 2,
      limit: WITHDRAW_DAILY_LIMIT,
      remaining: WITHDRAW_DAILY_LIMIT - 2,
    });
    // Same key and day the sponsor counts with.
    expect(readUsage).toHaveBeenCalledWith("withdraw:did:privy:ana", "2026-11-09");
  });

  it("is zero when the user hasn't withdrawn today, and never goes below zero remaining", async () => {
    await expect(readWithdrawalsToday("u", async () => null, NOW)).resolves.toMatchObject({
      used: 0,
      remaining: 3,
    });
    await expect(readWithdrawalsToday("u", async () => 5, NOW)).resolves.toMatchObject({
      used: 5,
      remaining: 0,
    });
  });
});
