import { requireUser } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/errors";
import { readWithdrawalsToday } from "@/lib/server/withdrawals";

/** `{ used, limit, remaining }`: the caller's sponsored withdrawals today (UTC day). */
export const GET = withErrors(async (req: Request) => {
  const { privyUserId } = await requireUser(req);
  return Response.json(await readWithdrawalsToday(privyUserId));
});
