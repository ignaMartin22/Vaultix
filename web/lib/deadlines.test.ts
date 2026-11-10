import { describe, expect, it } from "vitest";

import { activeDeadline, deadlineState, formatRemaining, nextCrankRun } from "./deadlines";
import { DEFAULT_PROTOCOL, type OrderStatus } from "./vaultix/contract";

const T0 = 1_750_000_000n;
const HOUR = 3_600n;

function order(status: OrderStatus) {
  return {
    status,
    paidAt: T0,
    shippedAt: T0 + 2n * HOUR,
    shipDeadlineSecs: DEFAULT_PROTOCOL.shipDeadlineSecs,
    claimWindowSecs: DEFAULT_PROTOCOL.claimWindowSecs,
  };
}

describe("activeDeadline", () => {
  it("Paid: ship deadline from paid_at", () => {
    expect(activeDeadline(order("Paid"))).toEqual({ kind: "ship", at: T0 + 432_000n });
  });

  it("Shipped: claim window from shipped_at", () => {
    expect(activeDeadline(order("Shipped"))).toEqual({
      kind: "claim",
      at: T0 + 2n * HOUR + 864_000n,
    });
  });

  it("no deadline in the other statuses", () => {
    for (const s of ["Created", "Disputed", "Released", "Refunded", "Resolved"] as const) {
      expect(activeDeadline(order(s))).toBeNull();
    }
  });
});

describe("deadlineState", () => {
  const at = T0 + 100n * HOUR;

  it("expires strictly after `at`, like the program", () => {
    expect(deadlineState(at, at).expired).toBe(false);
    expect(deadlineState(at, at + 1n)).toEqual({ expired: true, remainingSecs: 0n, urgent: false });
  });

  it("is urgent under 24 h", () => {
    expect(deadlineState(at, at - 24n * HOUR).urgent).toBe(false);
    expect(deadlineState(at, at - 24n * HOUR + 1n).urgent).toBe(true);
    expect(deadlineState(at, at - HOUR)).toEqual({ expired: false, remainingSecs: HOUR, urgent: true });
  });
});

describe("formatRemaining", () => {
  it("shows the two biggest units", () => {
    expect(formatRemaining(3n * 86_400n + 4n * HOUR + 59n)).toBe("3 d 4 h");
    expect(formatRemaining(5n * 86_400n)).toBe("5 d");
    expect(formatRemaining(5n * HOUR + 20n * 60n)).toBe("5 h 20 min");
    expect(formatRemaining(2n * HOUR)).toBe("2 h");
    expect(formatRemaining(12n * 60n + 30n)).toBe("12 min");
    expect(formatRemaining(59n)).toBe("menos de 1 min");
  });
});

describe("formatDeadline", () => {
  it("shows weekday, day/month and time in Argentina", async () => {
    const { formatDeadline } = await import("./deadlines");
    // 2026-11-12 17:30 UTC = 14:30 in Buenos Aires.
    const text = formatDeadline(BigInt(Date.UTC(2026, 10, 12, 17, 30) / 1000));
    expect(text).toMatch(/jueves/);
    expect(text).toMatch(/12\/11/);
    expect(text).toMatch(/14:30/);
  });
});

describe("nextCrankRun", () => {
  const at = (iso: string) => BigInt(Date.parse(iso) / 1000);

  it("is the next 09:00 UTC after the deadline", () => {
    expect(nextCrankRun(at("2026-11-12T14:30:00Z"))).toBe(at("2026-11-13T09:00:00Z"));
    expect(nextCrankRun(at("2026-11-12T03:00:00Z"))).toBe(at("2026-11-12T09:00:00Z"));
  });

  it("skips a run exactly at the deadline, which the program still rejects", () => {
    expect(nextCrankRun(at("2026-11-12T09:00:00Z"))).toBe(at("2026-11-13T09:00:00Z"));
  });
});
