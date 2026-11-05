import { withErrors } from "@/lib/server/errors";
import { listingsApi } from "@/lib/server/listings";

export const dynamic = "force-dynamic";

/** Public: the listed product behind a payment link, plus the seller's reputation. */
export const GET = withErrors(
  async (_req: Request, { params }: { params: Promise<{ pda: string }> }) => {
    const { pda } = await params;
    return Response.json(await listingsApi().getByOrder(pda));
  },
);
