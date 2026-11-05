/**
 * Tracking hash (specs/02-backend.md §2.2): on-chain `mark_shipped` stores
 * `sha256(utf8("<carrier>:<NUMBER>"))`, the number uppercased without spaces.
 * One implementation for the seller's form (W-07) and the API (B-05).
 */
export const CARRIERS = ["andreani", "oca", "correo_argentino", "otro"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const CARRIER_LABELS: Record<Carrier, string> = {
  andreani: "Andreani",
  oca: "OCA",
  correo_argentino: "Correo Argentino",
  otro: "Otro",
};

export function isCarrier(value: unknown): value is Carrier {
  return typeof value === "string" && (CARRIERS as readonly string[]).includes(value);
}

export function normalizeTrackingNumber(number: string): string {
  return number.replace(/\s+/g, "").toUpperCase();
}

export async function trackingHash(carrier: Carrier, number: string): Promise<Uint8Array> {
  const text = `${carrier}:${normalizeTrackingNumber(number)}`;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
