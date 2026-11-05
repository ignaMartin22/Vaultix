import { requireUser } from "@/lib/server/auth";
import { disputesApi } from "@/lib/server/disputes";
import { withErrors } from "@/lib/server/errors";

/** Arbiter only (404 for anyone else): Disputed orders with product, shipping and evidence. */
export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return Response.json(await disputesApi().adminDisputes(user));
});
