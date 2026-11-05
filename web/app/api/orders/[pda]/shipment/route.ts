import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { shippingApi } from "@/lib/server/shipping";

/** Seller: `{ carrier, trackingNumber }`. Checked against the on-chain tracking_hash once shipped. */
export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ pda: string }> }) => {
    const user = await requireUser(req);
    const { pda } = await params;
    const body: unknown = await req.json().catch(() => null);
    return Response.json(await shippingApi().saveShipment(user, pda, body));
  },
);

/** Buyer, seller or arbiter: carrier and number in plain text. */
export const GET = withErrors(
  async (req: Request, { params }: { params: Promise<{ pda: string }> }) => {
    const user = await requireUser(req);
    const { pda } = await params;
    return Response.json(await shippingApi().getShipment(user, pda));
  },
);
