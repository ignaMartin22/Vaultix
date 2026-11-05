import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";

/** The signed-in user, with their profile upserted on the way. */
export const GET = withErrors(async (req: Request) => {
  const { privyUserId, pubkey, email } = await requireUser(req);
  return Response.json({ privyUserId, pubkey, email });
});
