/**
 * Shipping address and tracking (specs/02-backend.md §2.2, §3):
 * - The buyer saves their address before paying (`POST /api/shipping`).
 * - The seller sees it only once the order is `Paid` or later, and only the
 *   address of the account that actually paid (`order.buyer`).
 * - The seller saves carrier + number; once `Shipped` it must hash to the
 *   on-chain `tracking_hash`. Buyer, seller and arbiter can read it.
 */
import { PublicKey } from "@solana/web3.js";

import { toHex } from "../listing-hash";
import { isCarrier, normalizeTrackingNumber, trackingHash, type Carrier } from "../tracking";
import type { ConfigAccount, OrderAccount } from "../vaultix/contract";
import type { AuthUser } from "./auth";
import { readConfig, readOrder } from "./chain";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";

export interface ShippingInfo {
  full_name: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
  notes: string | null;
}

export interface Shipment {
  carrier: Carrier;
  tracking_number: string;
}

export interface ShippingDeps {
  readOrder(address: PublicKey): Promise<OrderAccount | null>;
  readConfig(): Promise<ConfigAccount | null>;
  upsertShippingInfo(orderPda: string, buyer: string, info: ShippingInfo): Promise<void>;
  getShippingInfo(orderPda: string, buyer: string): Promise<ShippingInfo | null>;
  upsertShipment(orderPda: string, shipment: Shipment): Promise<void>;
  getShipment(orderPda: string): Promise<Shipment | null>;
}

const FIELDS: { key: keyof ShippingInfo; body: string; label: string; max: number; optional?: boolean }[] = [
  { key: "full_name", body: "fullName", label: "Nombre y apellido", max: 120 },
  { key: "phone", body: "phone", label: "Teléfono", max: 40 },
  { key: "street", body: "street", label: "Dirección", max: 200 },
  { key: "city", body: "city", label: "Ciudad", max: 100 },
  { key: "province", body: "province", label: "Provincia", max: 100 },
  { key: "postal_code", body: "postalCode", label: "Código postal", max: 20 },
  { key: "notes", body: "notes", label: "Notas", max: 500, optional: true },
];

function bad(message: string): never {
  throw new ApiError("bad_request", message);
}

function record(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) bad("Faltan datos.");
  return body as Record<string, unknown>;
}

function parsePda(value: unknown): PublicKey {
  try {
    return new PublicKey(String(value ?? ""));
  } catch {
    throw new ApiError("not_found", "Esta orden no existe.");
  }
}

export function parseShippingInfo(body: Record<string, unknown>): ShippingInfo {
  const info: Partial<Record<keyof ShippingInfo, string | null>> = {};
  for (const field of FIELDS) {
    const raw = body[field.body];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value && !field.optional) bad(`Completá: ${field.label}.`);
    if (value.length > field.max) bad(`${field.label} es demasiado largo.`);
    info[field.key] = value || null;
  }
  return info as ShippingInfo;
}

export function parseShipment(body: Record<string, unknown>): Shipment {
  if (!isCarrier(body.carrier)) bad("Elegí el correo.");
  const number = typeof body.trackingNumber === "string" ? normalizeTrackingNumber(body.trackingNumber) : "";
  if (number.length < 3 || number.length > 60) bad("Revisá el número de seguimiento.");
  return { carrier: body.carrier, tracking_number: number };
}

const isParty = (user: AuthUser, key: PublicKey | null) => key !== null && user.solanaPubkeys.includes(key.toBase58());

export function createShippingApi(deps: ShippingDeps) {
  async function order(pda: PublicKey): Promise<OrderAccount> {
    const o = await deps.readOrder(pda);
    if (!o) throw new ApiError("not_found", "Esta orden no existe.");
    return o;
  }

  /** `POST /api/shipping`: the caller's address for an order they are about to pay (or paid). */
  async function saveShippingInfo(user: AuthUser, body: unknown) {
    const b = record(body);
    const pda = parsePda(b.orderPda);
    const info = parseShippingInfo(b);
    const o = await order(pda);
    if (isParty(user, o.seller)) bad("No podés comprar tu propio producto.");
    if (o.status === "Created") {
      // Anyone about to pay may save an address; only the payer's is ever shown.
    } else if (o.status === "Paid" && isParty(user, o.buyer)) {
      // The buyer can still fix it before the seller ships.
    } else {
      throw new ApiError("forbidden", "Ya no se pueden cambiar los datos de envío de esta orden.");
    }
    await deps.upsertShippingInfo(pda.toBase58(), user.pubkey, info);
    return { ok: true };
  }

  /** `GET /api/orders/:pda/shipping`: seller only, from `Paid` on, the payer's address. */
  async function getShippingForSeller(user: AuthUser, pdaParam: string) {
    const pda = parsePda(pdaParam);
    const o = await order(pda);
    if (!isParty(user, o.seller)) throw new ApiError("forbidden");
    if (o.status === "Created" || !o.buyer) {
      throw new ApiError("forbidden", "Vas a ver los datos de envío cuando te paguen.");
    }
    const info = await deps.getShippingInfo(pda.toBase58(), o.buyer.toBase58());
    if (!info) throw new ApiError("not_found", "El comprador todavía no cargó sus datos de envío.");
    return { buyer: o.buyer.toBase58(), shipping: info };
  }

  /** `POST /api/orders/:pda/shipment`: seller only; must match `tracking_hash` once shipped. */
  async function saveShipment(user: AuthUser, pdaParam: string, body: unknown) {
    const pda = parsePda(pdaParam);
    const shipment = parseShipment(record(body));
    const o = await order(pda);
    if (!isParty(user, o.seller)) throw new ApiError("forbidden");
    if (o.status !== "Paid" && o.status !== "Shipped") {
      throw new ApiError("forbidden", "Esta orden no está esperando un envío.");
    }
    const hash = await trackingHash(shipment.carrier, shipment.tracking_number);
    if (o.status === "Shipped" && o.trackingHash && toHex(o.trackingHash) !== toHex(hash)) {
      bad("El seguimiento no coincide con el que registraste al despachar.");
    }
    await deps.upsertShipment(pda.toBase58(), shipment);
    return { ok: true, trackingHash: toHex(hash) };
  }

  /** `GET /api/orders/:pda/shipment`: buyer, seller or arbiter. */
  async function getShipment(user: AuthUser, pdaParam: string) {
    const pda = parsePda(pdaParam);
    const o = await order(pda);
    let allowed = isParty(user, o.seller) || isParty(user, o.buyer);
    if (!allowed) {
      const config = await deps.readConfig();
      allowed = config !== null && isParty(user, config.arbiter);
    }
    if (!allowed) throw new ApiError("forbidden");
    const shipment = await deps.getShipment(pda.toBase58());
    if (!shipment) throw new ApiError("not_found", "Todavía no hay datos de seguimiento.");
    const hash = toHex(await trackingHash(shipment.carrier, shipment.tracking_number));
    return {
      ...shipment,
      // Whether it matches what the seller registered on-chain at mark_shipped.
      verified: o.trackingHash !== null && toHex(o.trackingHash) === hash,
    };
  }

  return { saveShippingInfo, getShippingForSeller, saveShipment, getShipment };
}

function defaultDeps(): ShippingDeps {
  const db = supabaseAdmin();
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`, { cause: error });
  };
  return {
    readOrder,
    readConfig,
    async upsertShippingInfo(orderPda, buyer, info) {
      const { error } = await db
        .from("shipping_info")
        .upsert({ order_pda: orderPda, buyer_pubkey: buyer, ...info }, { onConflict: "order_pda,buyer_pubkey" });
      if (error) fail("shipping_info upsert", error);
    },
    async getShippingInfo(orderPda, buyer) {
      const { data, error } = await db
        .from("shipping_info")
        .select("full_name, phone, street, city, province, postal_code, notes")
        .eq("order_pda", orderPda)
        .eq("buyer_pubkey", buyer)
        .maybeSingle();
      if (error) fail("shipping_info select", error);
      return data;
    },
    async upsertShipment(orderPda, shipment) {
      const { error } = await db.from("shipments").upsert({ order_pda: orderPda, ...shipment }, { onConflict: "order_pda" });
      if (error) fail("shipments upsert", error);
    },
    async getShipment(orderPda) {
      const { data, error } = await db
        .from("shipments")
        .select("carrier, tracking_number")
        .eq("order_pda", orderPda)
        .maybeSingle();
      if (error) fail("shipments select", error);
      return data && isCarrier(data.carrier) ? { carrier: data.carrier, tracking_number: data.tracking_number } : null;
    },
  };
}

let api: ReturnType<typeof createShippingApi> | undefined;

export function shippingApi() {
  api ??= createShippingApi(defaultDeps());
  return api;
}
