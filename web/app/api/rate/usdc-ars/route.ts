import { fetchUsdcArsRate } from "@/lib/server/rate";

/**
 * Public reference quote (B-11): `{ rate: "1704.15", exchange, time }`, or
 * `{ rate: null }` if CriptoYa fails, so the UI just hides the pesos line.
 */
export async function GET() {
  const exchange = process.env.CRIPTOYA_EXCHANGE?.trim() || "lemoncash";
  try {
    return Response.json(await fetchUsdcArsRate(exchange));
  } catch (err) {
    console.warn("usdc-ars rate unavailable", err);
    return Response.json({ rate: null, exchange });
  }
}
