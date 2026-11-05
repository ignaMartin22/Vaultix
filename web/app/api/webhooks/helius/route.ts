import { serverEnv } from "@/lib/server/env";
import { withErrors } from "@/lib/server/errors";
import { handleHeliusWebhook, verifyWebhookAuth } from "@/lib/server/events";

/**
 * Helius raw webhook (01 §5.4): checks the shared Authorization header, then
 * indexes the program's events into order_events. Re-sending the same
 * payload inserts nothing new.
 */
export const POST = withErrors(async (req: Request) => {
  verifyWebhookAuth(req, serverEnv().heliusWebhookAuth);
  const body: unknown = await req.json().catch(() => null);
  return Response.json(await handleHeliusWebhook(body));
});
