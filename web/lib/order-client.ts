/**
 * Browser side of the post-payment APIs (02 §3): the buyer's address for the
 * seller, the shipment (carrier + number) and dispute evidence. Mock mode keeps
 * everything in memory for the tab, like the mock program client.
 */
import { apiFetch, ApiClientError, type GetAccessToken } from "./api";
import { mockShippingAddress, type ShippingAddress } from "./listings-client";
import { outcomeFromJson, type ClosedOutcome, type ClosedOutcomeJson } from "./order-outcome";
import type { Carrier } from "./tracking";
import { USE_MOCK } from "./vaultix/mode";

const path = (pda: string, rest: string) => `/api/orders/${encodeURIComponent(pda)}/${rest}`;

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiClientError && err.code === "not_found") return null;
    throw err;
  }
}

// ----- buyer's address, seen by the seller once paid -----

interface ShippingResponse {
  shipping: {
    full_name: string;
    phone: string;
    street: string;
    city: string;
    province: string;
    postal_code: string;
    notes: string | null;
  };
}

export async function getBuyerAddress(pda: string, getAccessToken: GetAccessToken): Promise<ShippingAddress | null> {
  if (USE_MOCK) return mockShippingAddress(pda);
  const res = await orNull(apiFetch<ShippingResponse>(path(pda, "shipping"), { getAccessToken }));
  if (!res) return null;
  const s = res.shipping;
  return {
    fullName: s.full_name,
    phone: s.phone,
    street: s.street,
    city: s.city,
    province: s.province,
    postalCode: s.postal_code,
    notes: s.notes ?? "",
  };
}

// ----- shipment -----

export interface ShipmentInfo {
  carrier: Carrier;
  trackingNumber: string;
  /** It matches the tracking hash the seller registered when shipping. */
  verified: boolean;
}

const mockShipments = new Map<string, ShipmentInfo>();

export async function saveShipment(
  pda: string,
  carrier: Carrier,
  trackingNumber: string,
  getAccessToken: GetAccessToken,
): Promise<void> {
  if (USE_MOCK) {
    mockShipments.set(pda, { carrier, trackingNumber: trackingNumber.replace(/\s+/g, "").toUpperCase(), verified: true });
    return;
  }
  await apiFetch(path(pda, "shipment"), { method: "POST", getAccessToken, body: { carrier, trackingNumber } });
}

export async function getShipment(pda: string, getAccessToken: GetAccessToken): Promise<ShipmentInfo | null> {
  if (USE_MOCK) return mockShipments.get(pda) ?? null;
  const res = await orNull(
    apiFetch<{ carrier: Carrier; tracking_number: string; verified: boolean }>(path(pda, "shipment"), {
      getAccessToken,
    }),
  );
  return res ? { carrier: res.carrier, trackingNumber: res.tracking_number, verified: res.verified } : null;
}

// ----- dispute evidence (B-09 contract) -----

export type EvidenceKind = "photo" | "video" | "note";

export interface EvidenceItem {
  id: string;
  uploader: string;
  kind: EvidenceKind;
  note: string | null;
  /** Signed URL (10 min) for photos and videos. */
  url: string | null;
  createdAt: string;
}

const evidencePath = (pda: string) => `/api/disputes/${encodeURIComponent(pda)}/evidence`;
const mockEvidence = new Map<string, EvidenceItem[]>();

export async function listEvidence(pda: string, getAccessToken: GetAccessToken): Promise<EvidenceItem[]> {
  if (USE_MOCK) return mockEvidence.get(pda) ?? [];
  const res = await orNull(apiFetch<{ items: EvidenceItem[] }>(evidencePath(pda), { getAccessToken }));
  return res?.items ?? [];
}

/** A note, or a file: the API returns a signed upload URL and we PUT the file to it. */
export async function addEvidence(
  pda: string,
  uploader: string,
  input: { kind: "note"; note: string } | { kind: "photo" | "video"; file: File; note?: string },
  getAccessToken: GetAccessToken,
): Promise<void> {
  if (USE_MOCK) {
    const item: EvidenceItem = {
      id: crypto.randomUUID(),
      uploader,
      kind: input.kind,
      note: input.note ?? null,
      url: input.kind === "note" ? null : URL.createObjectURL(input.file),
      createdAt: new Date().toISOString(),
    };
    mockEvidence.set(pda, [...(mockEvidence.get(pda) ?? []), item]);
    return;
  }

  const body =
    input.kind === "note"
      ? { kind: "note", note: input.note }
      : { kind: input.kind, contentType: input.file.type, size: input.file.size, note: input.note };
  const res = await apiFetch<{ id: string; upload?: { signedUrl: string } }>(evidencePath(pda), {
    method: "POST",
    getAccessToken,
    body,
  });
  if (input.kind !== "note") {
    if (!res.upload) throw new Error("Missing upload URL");
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", input.file);
    const put = await fetch(res.upload.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
    if (!put.ok) throw new Error(`Evidence upload failed (${put.status})`);
  }
}

/** How a closed order ended (from indexed events); null if it never reached a final status. */
export async function getClosedOutcome(pda: string): Promise<ClosedOutcome | null> {
  // The mock never closes final orders, so there's nothing to rebuild.
  if (USE_MOCK) return null;
  const res = await orNull(apiFetch<ClosedOutcomeJson>(path(pda, "outcome")));
  return res ? outcomeFromJson(res) : null;
}
