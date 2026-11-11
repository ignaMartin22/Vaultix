/**
 * `GET /api/orders/:pda/outcome`: how a finished order ended, from its indexed
 * events, for links whose account the crank already closed. Public: it's the
 * same data the program logged on-chain.
 */
import { PublicKey } from "@solana/web3.js";

import { outcomeFromEvents, outcomeToJson, type ClosedOutcomeJson } from "../order-outcome";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";

export async function closedOrderOutcome(pda: string): Promise<ClosedOutcomeJson> {
  const notFound = () => new ApiError("not_found", "Este link no existe o ya no está disponible.");
  try {
    new PublicKey(pda);
  } catch {
    throw notFound();
  }
  const { data, error } = await supabaseAdmin()
    .from("order_events")
    .select("event_type, payload, slot, event_index")
    .eq("order_pda", pda)
    .order("slot", { ascending: true })
    .order("event_index", { ascending: true })
    .limit(100);
  if (error) throw new Error(`order_events outcome: ${error.message}`, { cause: error });
  const outcome = outcomeFromEvents(
    (data ?? []).map((r) => ({
      type: r.event_type,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      slot: r.slot,
      index: r.event_index,
    })),
  );
  if (!outcome) throw notFound();
  return outcomeToJson(outcome);
}
