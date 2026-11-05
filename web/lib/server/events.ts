/**
 * Program events → `order_events` rows (specs/01-arquitectura.md §5.4, B-06).
 * Helius posts raw transactions; we decode the Anchor events from their logs
 * (`Program data:` lines, via the IDL) and insert them idempotently by
 * (signature, event_index). Only newly inserted rows are returned, so the
 * notifications (B-07) fire once per event even if Helius retries.
 */
import { timingSafeEqual } from "node:crypto";

import { BN, BorshCoder, EventParser, type Idl } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";

import idl from "../vaultix/idl.json";
import { PROGRAM_ID } from "../vaultix/pdas";
import { ApiError } from "./errors";
import { supabaseAdmin } from "./supabase";

export const EVENT_TYPES = [
  "OrderCreated",
  "OrderPaid",
  "OrderShipped",
  "OrderReleased",
  "OrderRefunded",
  "DisputeOpened",
  "DisputeResolved",
  "OrderClosed",
  "ConfigUpdated",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface OrderEventRow {
  signature: string;
  event_index: number;
  order_pda: string;
  event_type: EventType;
  /** snake_case keys as in the IDL; u64/i64 as strings, pubkeys base58, hashes hex. */
  payload: { [key: string]: Json };
  slot: number;
  block_time: string | null;
}

/** The part of a Helius raw transaction (same shape as `getTransaction`) we read. */
interface RawTransaction {
  slot?: number;
  blockTime?: number | null;
  meta?: { err?: unknown; logMessages?: string[] | null } | null;
  transaction?: { signatures?: string[] };
}

const parser = new EventParser(PROGRAM_ID, new BorshCoder(idl as Idl));

/** Anchor-decoded values → JSON that Postgres views can read (`->>`, casts). */
export function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (value instanceof PublicKey) return value.toBase58();
  if (BN.isBN(value)) return (value as BN).toString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) {
    // `[u8; 32]` hashes come back as number arrays.
    if (value.length > 0 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
      return Buffer.from(value as number[]).toString("hex");
    }
    return value.map(toJson);
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value as Json;
}

/** Decodes this program's events from one transaction's logs, in emission order. */
export function decodeEvents(logs: string[]): { name: EventType; data: Record<string, unknown> }[] {
  const out: { name: EventType; data: Record<string, unknown> }[] = [];
  for (const event of parser.parseLogs(logs)) {
    if ((EVENT_TYPES as readonly string[]).includes(event.name)) {
      out.push({ name: event.name as EventType, data: event.data as Record<string, unknown> });
    }
  }
  return out;
}

/** Every event of every successful transaction in a Helius raw webhook body. */
export function rowsFromWebhook(body: unknown): OrderEventRow[] {
  if (!Array.isArray(body)) throw new ApiError("bad_request", "Expected an array of transactions.");
  const rows: OrderEventRow[] = [];
  for (const tx of body as RawTransaction[]) {
    const signature = tx?.transaction?.signatures?.[0];
    const logs = tx?.meta?.logMessages;
    // Failed transactions still carry logs, but nothing they emitted happened.
    if (!signature || !logs || tx.meta?.err) continue;
    decodeEvents(logs).forEach((event, index) => {
      const payload = toJson(event.data) as { [key: string]: Json };
      const orderPda = (event.name === "ConfigUpdated" ? payload.config : payload.order) as string;
      rows.push({
        signature,
        event_index: index,
        order_pda: orderPda,
        event_type: event.name,
        payload,
        slot: tx.slot ?? 0,
        block_time: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
      });
    });
  }
  return rows;
}

/** Helius sends the configured `authHeader` as `Authorization`. Constant-time compare. */
export function verifyWebhookAuth(req: Request, expected: string | undefined): void {
  const got = req.headers.get("authorization") ?? "";
  if (!expected) throw new Error("HELIUS_WEBHOOK_AUTH is not configured");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError("unauthorized");
}

export interface EventsDeps {
  /** Inserts, skipping rows that already exist; returns only the new ones. */
  insertNew(rows: OrderEventRow[]): Promise<OrderEventRow[]>;
  /** B-07 hooks in here; called with new rows only. */
  onNewEvents?(rows: OrderEventRow[]): Promise<void>;
}

export function createWebhookHandler(deps: EventsDeps) {
  return async function handle(body: unknown) {
    const rows = rowsFromWebhook(body);
    const inserted = rows.length > 0 ? await deps.insertNew(rows) : [];
    if (inserted.length > 0 && deps.onNewEvents) {
      try {
        await deps.onNewEvents(inserted);
      } catch (err) {
        // Indexing succeeded; a notification failure must not make Helius retry.
        console.error("onNewEvents failed", err);
      }
    }
    return { received: rows.length, inserted: inserted.length };
  };
}

// ---------------------------------------------------------------------------
// Default (Supabase) dependencies
// ---------------------------------------------------------------------------

let handler: ReturnType<typeof createWebhookHandler> | undefined;

export async function handleHeliusWebhook(body: unknown) {
  if (!handler) {
    const db = supabaseAdmin();
    handler = createWebhookHandler({
      async insertNew(rows) {
        // ON CONFLICT DO NOTHING ... RETURNING: only rows that weren't there come back.
        const { data, error } = await db
          .from("order_events")
          .upsert(rows, { onConflict: "signature,event_index", ignoreDuplicates: true })
          .select("signature, event_index, order_pda, event_type, payload, slot, block_time");
        if (error) throw new Error(`order_events insert failed: ${error.message}`, { cause: error });
        return (data ?? []) as OrderEventRow[];
      },
    });
  }
  return handler(body);
}
