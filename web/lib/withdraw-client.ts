/** The account page's view of today's withdrawals (`GET /api/me/withdrawals`). */
import { apiFetch, type GetAccessToken } from "./api";
import { getVaultixClient, isMockClient } from "./vaultix/client";
import { withdrawalsToday, type WithdrawalsToday } from "./withdraw";

export const withdrawalsTodayKey = ["withdrawals-today"] as const;

export async function getWithdrawalsToday(
  getAccessToken: GetAccessToken,
): Promise<WithdrawalsToday> {
  // Test mode has no sponsor, so nothing is counted.
  if (isMockClient(getVaultixClient())) return withdrawalsToday(0);
  return apiFetch<WithdrawalsToday>("/api/me/withdrawals", { getAccessToken });
}
