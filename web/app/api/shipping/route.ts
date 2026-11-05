import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { shippingApi } from "@/lib/server/shipping";

/** Body: `{ orderPda, fullName, phone, street, city, province, postalCode, notes? }`. */
export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const body: unknown = await req.json().catch(() => null);
  return Response.json(await shippingApi().saveShippingInfo(user, body));
});
