import { withErrors } from "@/lib/server/errors";
import { closedOrderOutcome } from "@/lib/server/order-outcome";

/** Public: how a finished order ended, once the crank closed its account. */
export const GET = withErrors(
  async (_req: Request, { params }: { params: Promise<{ pda: string }> }) => {
    const { pda } = await params;
    return Response.json(await closedOrderOutcome(pda));
  },
);
