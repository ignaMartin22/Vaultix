import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { listingsApi } from "@/lib/server/listings";

/** Body: `{ orderPda }`. Checks the on-chain Order and lists the publication. */
export const POST = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(req);
    const { id } = await params;
    const body: unknown = await req.json().catch(() => null);
    return Response.json(await listingsApi().activate(user, id, body));
  },
);
