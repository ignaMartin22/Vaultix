import { runCrank, verifyCronAuth } from "@/lib/server/crank";
import { serverEnv } from "@/lib/server/env";
import { withErrors } from "@/lib/server/errors";

/**
 * Daily Vercel Cron (vercel.json): refunds unshipped orders past their ship
 * deadline, releases shipped ones past the claim window and closes final
 * orders. Protected with CRON_SECRET. Returns a summary per order.
 */
export const GET = withErrors(async (req: Request) => {
  verifyCronAuth(req, serverEnv().cronSecret);
  return Response.json(await runCrank());
});
