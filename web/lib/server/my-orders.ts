/**
 * `GET /api/me/orders` (specs/02-backend.md §3, B-10): the user's sales and
 * purchases from indexed events plus the product from `listings`. No status:
 * the web reads it on-chain in one batch (`getMultipleAccountsInfo`).
 */
import { outcomeFromEvents, type FinalStatus, type HistoryEvent } from "../order-outcome";
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
  /** How it ended, from the events: lets the list show it once the crank closed the account. */
  endedAs: FinalStatus | null;
}

export interface MyOrdersDeps {
  /** OrderCreated events whose seller is one of the pubkeys. */
  sales(pubkeys: string[]): Promise<EventRef[]>;
  /** OrderPaid events whose buyer is one of the pubkeys. */
  purchases(pubkeys: string[]): Promise<EventRef[]>;
  listings(orderPdas: string[]): Promise<Map<string, { title: string; amountUnits: string; photoPath: string | null }>>;
  publicPhotoUrl(path: string): string;
  /** Every indexed event of these orders. */
  events(orderPdas: string[]): Promise<Map<string, HistoryEvent[]>>;
}

const newestFirst = (a: MyOrder, b: MyOrder) => (b.at ?? "").localeCompare(a.at ?? "");

export function createMyOrders(deps: MyOrdersDeps) {
  return async function myOrders(user: AuthUser): Promise<{ sales: MyOrder[]; purchases: MyOrder[] }> {
    const [sales, purchases] = await Promise.all([deps.sales(user.solanaPubkeys), deps.purchases(user.solanaPubkeys)]);
    const pdas = [...new Set([...sales, ...purchases].map((e) => e.orderPda))];
    const [listings, events] =
      pdas.length > 0 ? await Promise.all([deps.listings(pdas), deps.events(pdas)]) : [new Map(), new Map()];

    const toOrder = (role: MyOrder["role"]) => (e: EventRef): MyOrder => {
      const l = listings.get(e.orderPda);
      return {
        orderPda: e.orderPda,
        role,
        title: l?.title ?? null,
        amountUnits: l?.amountUnits ?? null,
        photoUrl: l?.photoPath ? deps.publicPhotoUrl(l.photoPath) : null,
        at: e.at,
        endedAs: outcomeFromEvents(events.get(e.orderPda) ?? [])?.status ?? null,
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
    async events(pdas) {
      const { data, error } = await db
        .from("order_events")
        .select("order_pda, event_type, payload, slot, event_index")
        .in("order_pda", pdas)
        .limit(2000);
      if (error) fail("order_events by order", error);
      const out = new Map<string, HistoryEvent[]>();
      for (const r of data ?? []) {
        const list = out.get(r.order_pda) ?? [];
        list.push({
          type: r.event_type,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          slot: r.slot,
          index: r.event_index,
        });
        out.set(r.order_pda, list);
      }
      return out;
    },
  };
}

let handler: ReturnType<typeof createMyOrders> | undefined;

export function myOrders(user: AuthUser) {
  handler ??= createMyOrders(defaultDeps());
  return handler(user);
}
