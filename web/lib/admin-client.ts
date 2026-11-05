/**
 * The arbiter's queue (03 §5.6): `GET /api/admin/disputes`, or the same shape
 * assembled from the in-memory mock (program client, listings, shipments and
 * evidence of this tab).
 */
import { apiFetch, type GetAccessToken } from "./api";
import { getListingByOrder, mockShippingAddress } from "./listings-client";
import { getShipment, listEvidence, type EvidenceItem } from "./order-client";
import { getVaultixClient, isMockClient } from "./vaultix/client";
import { USE_MOCK } from "./vaultix/mode";

export interface AdminDispute {
  orderPda: string;
  order: {
    seller: string;
    buyer: string | null;
    amountUnits: string;
    feeBps: number;
    disputeDepositUnits: string;
    paidAt: number;
    shippedAt: number;
    trackingHash: string | null;
  };
  listing: { title: string; description: string; photoUrls: string[]; verified: boolean } | null;
  shipment: { carrier: string; tracking_number: string } | null;
  shipping: {
    full_name: string;
    phone: string;
    street: string;
    city: string;
    province: string;
    postal_code: string;
    notes: string | null;
  } | null;
  evidence: EvidenceItem[];
}

export async function getAdminDisputes(getAccessToken: GetAccessToken): Promise<AdminDispute[]> {
  if (!USE_MOCK) {
    const res = await apiFetch<{ disputes: AdminDispute[] }>("/api/admin/disputes", { getAccessToken });
    return res.disputes;
  }

  const client = getVaultixClient();
  if (!isMockClient(client)) return [];
  const orders = await client.getOrders({ status: "Disputed" });
  return Promise.all(
    orders.map(async ({ address, account: o }) => {
      const pda = address.toBase58();
      const [listing, shipment, evidence] = await Promise.all([
        getListingByOrder(pda),
        getShipment(pda, getAccessToken),
        listEvidence(pda, getAccessToken),
      ]);
      const address_ = mockShippingAddress(pda);
      return {
        orderPda: pda,
        order: {
          seller: o.seller.toBase58(),
          buyer: o.buyer?.toBase58() ?? null,
          amountUnits: o.amount.toString(),
          feeBps: o.feeBps,
          disputeDepositUnits: o.disputeDeposit.toString(),
          paidAt: Number(o.paidAt),
          shippedAt: Number(o.shippedAt),
          trackingHash: null,
        },
        listing: listing
          ? {
              title: listing.listing.title,
              description: listing.listing.description,
              photoUrls: listing.listing.photoUrls,
              verified: true,
            }
          : null,
        shipment: shipment ? { carrier: shipment.carrier, tracking_number: shipment.trackingNumber } : null,
        shipping: address_
          ? {
              full_name: address_.fullName,
              phone: address_.phone,
              street: address_.street,
              city: address_.city,
              province: address_.province,
              postal_code: address_.postalCode,
              notes: address_.notes || null,
            }
          : null,
        evidence,
      };
    }),
  );
}
