/**
 * USDC amounts as `bigint` minimum units (specs/03-frontend.md §2). User input
 * is parsed from its digits, never through a float.
 */
import { U64_MAX, USDC_DECIMALS } from "./vaultix/contract";

export const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS);

export type AmountParseErrorReason = "empty" | "invalid" | "too_many_decimals" | "too_large";

export class AmountParseError extends Error {
  constructor(readonly reason: AmountParseErrorReason) {
    super(`Invalid amount: ${reason}`);
    this.name = "AmountParseError";
  }
}

/**
 * Parses "120", "120,50", "120.50" or ",5" into minimum units. A single comma
 * or dot is the decimal separator; thousands separators are rejected because
 * "1.200" is ambiguous between locales.
 */
export function parseAmount(input: string, decimals: number = USDC_DECIMALS): bigint {
  const text = input.trim();
  if (text === "") throw new AmountParseError("empty");
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!match) throw new AmountParseError("invalid");
  const [, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") throw new AmountParseError("invalid");
  if (fraction.length > decimals) throw new AmountParseError("too_many_decimals");

  const units =
    BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units > U64_MAX) throw new AmountParseError("too_large");
  return units;
}

/**
 * "120.50": at least 2 decimals, up to `decimals` without trailing zeros.
 * Dot as decimal separator and no grouping, as the mono amount in the UI.
 */
export function formatAmount(units: bigint, decimals: number = USDC_DECIMALS): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fraction.length < 2) fraction = fraction.padEnd(Math.min(2, decimals), "0");
  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/** "USDC 120.50". */
export function formatUsdc(units: bigint): string {
  return `USDC ${formatAmount(units)}`;
}

/**
 * Pesos reference for `units` of USDC at `arsPerUsdc` (CriptoYa quote), rounded
 * to whole pesos. The quote is a float from the API; it's scaled to an integer
 * once so the amount itself never becomes a float.
 */
export function usdcToArs(units: bigint, arsPerUsdc: number): bigint {
  if (!Number.isFinite(arsPerUsdc) || arsPerUsdc <= 0) {
    throw new RangeError(`Invalid ARS quote: ${arsPerUsdc}`);
  }
  const RATE_SCALE = 10_000n;
  const rate = BigInt(Math.round(arsPerUsdc * Number(RATE_SCALE)));
  const denominator = USDC_UNIT * RATE_SCALE;
  return (units * rate + denominator / 2n) / denominator;
}

/** "≈ $ 145.300" (es-AR grouping, no decimals). */
export function formatArsApprox(pesos: bigint): string {
  const grouped = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `≈ $ ${grouped}`;
}
