/**
 * How many sponsored withdrawals a user has used today: the same counter the
 * sponsor checks, so what the page shows is what the sponsor enforces.
 */
import {
  WITHDRAW_DAILY_LIMIT,
  withdrawalsToday,
  withdrawUsageKey,
  type WithdrawalsToday,
} from "../withdraw";
import { ApiError } from "./errors";
import { utcDay } from "./fee-payer";
import { supabaseAdmin } from "./supabase";

/** Reads one `sponsor_usage` row; `null` when the user hasn't withdrawn today. */
export type ReadUsage = (key: string, day: string) => Promise<number | null>;

export async function readWithdrawalsToday(
  privyUserId: string,
  readUsage: ReadUsage = readUsageFromDb,
  now: Date = new Date(),
): Promise<WithdrawalsToday> {
  const used = (await readUsage(withdrawUsageKey(privyUserId), utcDay(now))) ?? 0;
  return withdrawalsToday(used, WITHDRAW_DAILY_LIMIT);
}

async function readUsageFromDb(key: string, day: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin()
    .from("sponsor_usage")
    .select("count")
    .eq("privy_user_id", key)
    .eq("day", day)
    .maybeSingle();
  if (error) throw new ApiError("internal", undefined, { cause: error });
  return data?.count ?? null;
}
