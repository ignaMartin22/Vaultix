import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { myOrders } from "@/lib/server/my-orders";

/** The signed-in user's `{ sales, purchases }`, newest first. Status is read on-chain by the web. */
export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return Response.json(await myOrders(user));
});
