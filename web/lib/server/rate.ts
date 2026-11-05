/**
 * USDC→ARS reference quote from CriptoYa (specs/02-backend.md §3, B-11).
 * We use `totalAsk`: what someone pays in pesos to get 1 USDC, fees included,
 * the honest reference for a buyer. Exposed as a decimal string, never a float.
 */
import { cacheLife } from "next/cache";

export interface UsdcArsRate {
  /** Pesos per USDC with 2 decimals, e.g. "1704.15". */
  rate: string;
  exchange: string;
  /** Unix seconds of CriptoYa's quote. */
  time: number;
}

/** Parses CriptoYa's `/api/<exchange>/usdc/ars/<volume>` body. Throws on anything odd. */
export function parseCriptoYa(body: unknown, exchange: string): UsdcArsRate {
  const b = body as { totalAsk?: unknown; time?: unknown } | null;
  const ask = typeof b?.totalAsk === "number" ? b.totalAsk : NaN;
  if (!Number.isFinite(ask) || ask <= 0) throw new Error("CriptoYa: invalid totalAsk");
  const time = typeof b?.time === "number" ? b.time : Math.floor(Date.now() / 1000);
  // Round the API's float once, to cents, and keep it as text from here on.
  return { rate: (Math.round(ask * 100) / 100).toFixed(2), exchange, time };
}

/** Cached for 5 minutes. Failures throw, and thrown results are never cached. */
export async function fetchUsdcArsRate(exchange: string): Promise<UsdcArsRate> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const url = `https://criptoya.com/api/${encodeURIComponent(exchange)}/usdc/ars/0.1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`CriptoYa: HTTP ${res.status}`);
  return parseCriptoYa(await res.json(), exchange);
}
