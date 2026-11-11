/**
 * `/orders` data (03 §5.5): the list from `GET /api/me/orders`, and each
 * order's status read on-chain in one batch. In mock mode the list comes
 * from the mock program client and this tab's listings.
 */
import { PublicKey } from "@solana/web3.js";

import { apiFetch, type GetAccessToken } from "./api";
import { getListingByOrder } from "./listings-client";
import { AnchorVaultixClient, getVaultixClient, isMockClient } from "./vaultix/client";
import type { FinalStatus } from "./order-outcome";
import type { OrderAccount } from "./vaultix/contract";

export interface MyOrder {
  orderPda: string;
  role: "seller" | "buyer";
  title: string | null;
  amountUnits: string | null;
  photoUrl: string | null;
  at: string | null;
  /** How it ended (from indexed events), for orders whose account is already closed. */
  endedAs: FinalStatus | null;
}

export interface MyOrders {
  sales: MyOrder[];
  purchases: MyOrder[];
}

export async function getMyOrders(owner: PublicKey, getAccessToken: GetAccessToken): Promise<MyOrders> {
  const client = getVaultixClient();
  if (!isMockClient(client)) return apiFetch<MyOrders>("/api/me/orders", { getAccessToken });

  const [sold, bought] = await Promise.all([client.getOrders({ seller: owner }), client.getOrders({ buyer: owner })]);
  const toOrder = (role: MyOrder["role"]) => async ({ address, account }: { address: PublicKey; account: OrderAccount }) => {
    const listing = await getListingByOrder(address.toBase58());
    return {
      orderPda: address.toBase58(),
      role,
      title: listing?.listing.title ?? null,
      amountUnits: account.amount.toString(),
      photoUrl: listing?.listing.photoUrls[0] ?? null,
      at: new Date(Number(account.createdAt) * 1000).toISOString(),
      // The mock never closes final orders: the live status is always there.
      endedAs: null,
    };
  };
  const byDate = (a: MyOrder, b: MyOrder) => (b.at ?? "").localeCompare(a.at ?? "");
  return {
    sales: (await Promise.all(sold.map(toOrder("seller")))).sort(byDate),
    purchases: (await Promise.all(bought.map(toOrder("buyer")))).sort(byDate),
  };
}

/** Status of each order, by PDA; missing entries are closed orders. */
export async function getStatuses(pdas: string[]): Promise<Map<string, OrderAccount | null>> {
  const client = getVaultixClient();
  const keys = pdas.map((p) => new PublicKey(p));
  const accounts =
    client instanceof AnchorVaultixClient
      ? await client.getOrdersByAddress(keys)
      : await Promise.all(keys.map((k) => client.getOrder(k)));
  return new Map(pdas.map((p, i) => [p, accounts[i]]));
}
