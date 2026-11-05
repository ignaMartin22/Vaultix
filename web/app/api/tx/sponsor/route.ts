import { requireUser } from "@/lib/server/auth";
import { ApiError, withErrors } from "@/lib/server/errors";
import { sponsorTransaction } from "@/lib/server/fee-payer";

export const dynamic = "force-dynamic";

/**
 * Body: `{ transaction: <base64 legacy tx, partially signed by the user> }`.
 * Validates it (01 §6), co-signs with the fee payer, sends it and returns
 * `{ signature }`. The client confirms with commitment `confirmed`.
 */
export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("transaction" in body)) {
    throw new ApiError("bad_request");
  }
  return Response.json(await sponsorTransaction(user, body.transaction));
});
