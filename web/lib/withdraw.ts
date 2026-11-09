/**
 * Withdrawals: a user moves their USDC to another Solana address and Vaultix
 * sponsors the network fee (owner decision, option A). Shared by the account
 * page and the sponsor so both enforce the same numbers.
 */
import { PublicKey } from "@solana/web3.js";

import { AmountParseError, formatUsdc, parseAmount } from "./amounts";
import { USDC_DECIMALS } from "./vaultix/contract";

/** The name the sponsor reports for a withdrawal transaction. */
export const WITHDRAW_USDC = "withdraw_usdc";

/**
 * Smallest sponsored withdrawal: 1 USDC. Creating the destination's USDC
 * account costs the fee payer ~0.002 SOL, so dust withdrawals would let
 * anyone drain it by opening accounts.
 */
export const MIN_WITHDRAW_UNITS = 10n ** BigInt(USDC_DECIMALS);

/** Sponsored withdrawals per user per UTC day, on top of the general daily limit. */
export const WITHDRAW_DAILY_LIMIT = 3;

/** `sponsor_usage` key of a user's withdrawal count (same table as the general one). */
export function withdrawUsageKey(privyUserId: string): string {
  return `withdraw:${privyUserId}`;
}

/** What `GET /api/me/withdrawals` returns. Attempts count even if they fail (anti-abuse). */
export interface WithdrawalsToday {
  used: number;
  limit: number;
  remaining: number;
}

export function withdrawalsToday(used: number, limit: number = WITHDRAW_DAILY_LIMIT): WithdrawalsToday {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

const AMOUNT_ERRORS: Record<AmountParseError["reason"], string> = {
  empty: "Poné cuánto querés retirar.",
  invalid: "Escribí el monto con números, por ejemplo 10,50.",
  too_many_decimals: "Usá hasta 6 decimales.",
  too_large: "El monto es demasiado alto.",
};

/** The amount text → units, or the Spanish error to show under the field. */
export function validateWithdrawAmount(
  text: string,
  balance: bigint,
): { amount?: bigint; error?: string } {
  try {
    const amount = parseAmount(text);
    if (amount < MIN_WITHDRAW_UNITS)
      return { error: `El mínimo para retirar es ${formatUsdc(MIN_WITHDRAW_UNITS)}.` };
    if (amount > balance) return { error: `No te alcanza: tenés ${formatUsdc(balance)}.` };
    return { amount };
  } catch (err) {
    if (err instanceof AmountParseError) return { error: AMOUNT_ERRORS[err.reason] };
    throw err;
  }
}

/** The destination text → a Solana address, or the Spanish error to show. */
export function validateWithdrawDestination(
  text: string,
  owner: PublicKey,
): { destination?: PublicKey; error?: string } {
  const value = text.trim();
  if (!value) return { error: "Pegá la dirección a la que querés mandar la plata." };
  let destination: PublicKey;
  try {
    destination = new PublicKey(value);
  } catch {
    return { error: "Esa no es una dirección de Solana. Revisá que esté completa." };
  }
  if (destination.equals(owner)) return { error: "Esa es tu propia dirección." };
  return { destination };
}
