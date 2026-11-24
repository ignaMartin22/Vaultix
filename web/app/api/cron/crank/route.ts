import { runCrank, verifyCronAuth } from "@/lib/server/crank";
import { serverEnv } from "@/lib/server/env";
import { withErrors } from "@/lib/server/errors";
import { pingDatabase } from "@/lib/server/supabase";

/**
 * Daily Vercel Cron (vercel.json): refunds unshipped orders past their ship
 * deadline, releases shipped ones past the claim window and closes final
 * orders. It also pings Supabase first, because the crank only reads the chain
 * and the free tier pauses a project after a week without database activity.
 * Protected with CRON_SECRET. Returns a summary per order.
 */
export const GET = withErrors(async (req: Request) => {
  verifyCronAuth(req, serverEnv().cronSecret);
  const database = await pingDatabase();
  return Response.json({ database, ...(await runCrank()) });
});
