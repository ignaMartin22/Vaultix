import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { shippingApi } from "@/lib/server/shipping";

/** Seller only, once paid: the buyer's shipping address (02 §2.2). */
export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ pda: string }> }) => {
    const user = await requireUser(req);
    const { pda } = await params;
    return Response.json(await shippingApi().getShippingForSeller(user, pda));
  },
);
