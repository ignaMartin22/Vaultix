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
