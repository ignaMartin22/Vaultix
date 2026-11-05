import { describe, expect, it } from "vitest";

import {
  AmountParseError,
  formatAmount,
  formatArsApprox,
  formatUsdc,
  parseAmount,
  usdcToArs,
} from "./amounts";
import { U64_MAX } from "./vaultix/contract";

function reason(input: string) {
  try {
    parseAmount(input);
  } catch (err) {
    if (err instanceof AmountParseError) return err.reason;
    throw err;
  }
  return null;
}

describe("parseAmount", () => {
  it("accepts comma or dot as the decimal separator", () => {
    expect(parseAmount("120,50")).toBe(120_500_000n);
    expect(parseAmount("120.50")).toBe(120_500_000n);
    expect(parseAmount("  120 ")).toBe(120_000_000n);
    expect(parseAmount("0,000001")).toBe(1n);
    expect(parseAmount(",5")).toBe(500_000n);
    expect(parseAmount("7.")).toBe(7_000_000n);
  });

  it("does not lose precision the way floats do", () => {
    // 0.1 + 0.2 style: as a float this would be 0.30000000000000004.
    expect(parseAmount("0.3")).toBe(300_000n);
    expect(parseAmount("123456789.123456")).toBe(123_456_789_123_456n);
  });

  it("rejects more than 6 decimals", () => {
    expect(reason("1.1234567")).toBe("too_many_decimals");
  });

  it("rejects malformed input", () => {
    expect(reason("")).toBe("empty");
    expect(reason("   ")).toBe("empty");
    for (const bad of [".", "abc", "-5", "1e3", "1.200,50", "1,2,3", "12 0", "+3"]) {
      expect(reason(bad), bad).toBe("invalid");
    }
  });

  it("rejects values above u64", () => {
    expect(reason("18446744073709.551616")).toBe("too_large");
    expect(parseAmount("18446744073709.551615")).toBe(U64_MAX);
  });
});

describe("formatAmount / formatUsdc", () => {
  it("shows at least 2 decimals and trims trailing zeros", () => {
    expect(formatAmount(120_500_000n)).toBe("120.50");
    expect(formatAmount(120_000_000n)).toBe("120.00");
    expect(formatAmount(1n)).toBe("0.000001");
    expect(formatAmount(1_234_500n)).toBe("1.2345");
    expect(formatAmount(0n)).toBe("0.00");
    expect(formatUsdc(45_000_000n)).toBe("USDC 45.00");
  });

  it("round-trips with parseAmount", () => {
    for (const units of [0n, 1n, 999_999n, 120_500_000n, U64_MAX]) {
      expect(parseAmount(formatAmount(units))).toBe(units);
    }
  });
});

describe("usdcToArs / formatArsApprox", () => {
  it("converts at the quote and rounds to whole pesos", () => {
    expect(usdcToArs(120_500_000n, 1205.8)).toBe(145_299n);
    expect(usdcToArs(1_000_000n, 1210.5)).toBe(1_211n);
    expect(formatArsApprox(145_300n)).toBe("≈ $ 145.300");
    expect(formatArsApprox(1_234_567n)).toBe("≈ $ 1.234.567");
    expect(formatArsApprox(999n)).toBe("≈ $ 999");
  });

  it("rejects an invalid quote", () => {
    expect(() => usdcToArs(1n, 0)).toThrow(RangeError);
    expect(() => usdcToArs(1n, Number.NaN)).toThrow(RangeError);
  });
});
