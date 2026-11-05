/**
 * `GET /api/me/orders` (specs/02-backend.md §3, B-10): the user's sales and
 * purchases from indexed events plus the product from `listings`. No status:
 * the web reads it on-chain in one batch (`getMultipleAccountsInfo`).
 */
import type { AuthUser } from "./auth";
import { PHOTOS_BUCKET } from "./listings";
import { supabaseAdmin } from "./supabase";

export interface EventRef {
  orderPda: string;
  /** ISO time of the OrderCreated (sales) or OrderPaid (purchases) event. */
  at: string | null;
}

export interface MyOrder {
  orderPda: string;
  role: "seller" | "buyer";
  title: string | null;
  amountUnits: string | null;
  photoUrl: string | null;
  at: string | null;
}

export interface MyOrdersDeps {
  /** OrderCreated events whose seller is one of the pubkeys. */
  sales(pubkeys: string[]): Promise<EventRef[]>;
  /** OrderPaid events whose buyer is one of the pubkeys. */
  purchases(pubkeys: string[]): Promise<EventRef[]>;
  listings(orderPdas: string[]): Promise<Map<string, { title: string; amountUnits: string; photoPath: string | null }>>;
  publicPhotoUrl(path: string): string;
}

const newestFirst = (a: MyOrder, b: MyOrder) => (b.at ?? "").localeCompare(a.at ?? "");

export function createMyOrders(deps: MyOrdersDeps) {
  return async function myOrders(user: AuthUser): Promise<{ sales: MyOrder[]; purchases: MyOrder[] }> {
    const [sales, purchases] = await Promise.all([deps.sales(user.solanaPubkeys), deps.purchases(user.solanaPubkeys)]);
    const pdas = [...new Set([...sales, ...purchases].map((e) => e.orderPda))];
    const listings = pdas.length > 0 ? await deps.listings(pdas) : new Map();

    const toOrder = (role: MyOrder["role"]) => (e: EventRef): MyOrder => {
      const l = listings.get(e.orderPda);
      return {
        orderPda: e.orderPda,
        role,
        title: l?.title ?? null,
        amountUnits: l?.amountUnits ?? null,
        photoUrl: l?.photoPath ? deps.publicPhotoUrl(l.photoPath) : null,
        at: e.at,
      };
    };
    // One row per order even if an event was indexed twice under different signatures.
    const unique = (refs: EventRef[]) => [...new Map(refs.map((r) => [r.orderPda, r])).values()];

    return {
      sales: unique(sales).map(toOrder("seller")).sort(newestFirst),
      purchases: unique(purchases).map(toOrder("buyer")).sort(newestFirst),
    };
  };
}

function defaultDeps(): MyOrdersDeps {
  const db = supabaseAdmin();
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`, { cause: error });
  };
  const byParty = async (type: "OrderCreated" | "OrderPaid", key: "seller" | "buyer", pubkeys: string[]) => {
    const { data, error } = await db
      .from("order_events")
      .select("order_pda, block_time")
      .eq("event_type", type)
      // JSON path filter; base58 pubkeys have no commas or parentheses to escape.
      .filter(`payload->>${key}`, "in", `(${pubkeys.join(",")})`)
      .order("block_time", { ascending: false })
      .limit(200);
    if (error) fail(`order_events ${type}`, error);
    return (data ?? []).map((r) => ({ orderPda: r.order_pda, at: r.block_time }));
  };
  return {
    sales: (pubkeys) => byParty("OrderCreated", "seller", pubkeys),
    purchases: (pubkeys) => byParty("OrderPaid", "buyer", pubkeys),
    async listings(pdas) {
      const { data, error } = await db.from("listings").select("order_pda, title, amount_units, photo_paths").in("order_pda", pdas);
      if (error) fail("listings", error);
      return new Map(
        (data ?? []).flatMap((l) =>
          l.order_pda
            ? [[l.order_pda, { title: l.title, amountUnits: String(l.amount_units), photoPath: l.photo_paths[0] ?? null }]]
            : [],
        ),
      );
    },
    publicPhotoUrl: (path) => db.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

let handler: ReturnType<typeof createMyOrders> | undefined;

export function myOrders(user: AuthUser) {
  handler ??= createMyOrders(defaultDeps());
  return handler(user);
}
