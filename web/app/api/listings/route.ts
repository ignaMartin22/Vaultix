import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { listingsApi } from "@/lib/server/listings";

/**
 * Body: `{ title, description?, amountUnits: "<u64 string>", photos: [{ contentType }] }`.
 * Creates the draft and returns its id, `orderId`, `orderPda`, `listingHash`
 * and one signed upload URL per photo.
 */
export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const body: unknown = await req.json().catch(() => null);
  return Response.json(await listingsApi().createDraft(user, body), { status: 201 });
});
