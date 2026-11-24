/**
 * Service-role Supabase client for API routes. It bypasses RLS, so it must
 * never be imported from client components.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./db-types";
import { serverEnv } from "./env";

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | undefined;

export function supabaseAdmin(): AdminClient {
  if (!client) {
    const env = serverEnv();
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Cheapest real query (a head count, no rows). The daily cron calls it so the
 * free-tier project never goes a week without activity and gets paused.
 * Never throws: the crank must run even if the database is down.
 */
export async function pingDatabase(db: Pick<AdminClient, "from"> = supabaseAdmin()): Promise<"ok" | string> {
  try {
    const { error } = await db.from("listings").select("id", { count: "exact", head: true });
    return error ? error.message : "ok";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
