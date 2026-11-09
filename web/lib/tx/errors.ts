/**
 * Any failure of a transaction (program error, API error, wallet rejection)
 * mapped to the Spanish message the UI shows (specs/03-frontend.md §4).
 */
import { ApiClientError } from "../api";
import {
  ANCHOR_CUSTOM_ERROR_OFFSET,
  VAULTIX_ERROR_NAMES,
  isVaultixError,
  type VaultixErrorCode,
} from "../vaultix/contract";

const PROGRAM_MESSAGES: Partial<Record<VaultixErrorCode, string>> = {
  InvalidStatus: "Esta orden ya cambió de estado. Actualizá la página.",
  NotSeller: "Solo quien vende puede hacer esto.",
  NotBuyer: "Solo quien compró puede hacer esto.",
  NotArbiter: "Solo el árbitro puede resolver reclamos.",
  SellerCannotBuy: "No podés comprar tu propio producto.",
  InvalidAmount: "El precio no es válido.",
  AmountExceedsMax: "El precio supera el máximo permitido.",
  DeadlineNotReached: "Todavía no venció el plazo.",
  ClaimWindowClosed: "Ya pasó el plazo para reclamar.",
  InsufficientFunds: "No te alcanza el saldo.",
  AccountAlreadyInUse: "Ese link ya existe. Probá de nuevo.",
  AccountNotInitialized: "Falta una cuenta para completar la operación.",
};

const GENERIC = "No se pudo completar la operación. Probá de nuevo en un rato.";

/** `custom program error: 0x1770` (6000) → `InvalidStatus`. */
export function programErrorName(text: string): VaultixErrorCode | null {
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  // Anchor logs say "Error Number: 6000"; confirmTransaction returns {"Custom":6000}.
  const decimal = /Error Number: (\d+)/.exec(text) ?? /"Custom":\s*(\d+)/.exec(text);
  const code = hex ? parseInt(hex[1], 16) : decimal ? Number(decimal[1]) : null;
  if (code !== null) {
    const name = VAULTIX_ERROR_NAMES[code - ANCHOR_CUSTOM_ERROR_OFFSET];
    if (name) return name;
    // SPL Token's InsufficientFunds is custom error 1.
    if (code === 1 && /Tokenkeg|TokenzQd|insufficient/i.test(text)) return "InsufficientFunds";
  }
  if (/already in use/i.test(text)) return "AccountAlreadyInUse";
  if (/AccountNotInitialized/.test(text)) return "AccountNotInitialized";
  if (/insufficient funds/i.test(text)) return "InsufficientFunds";
  return null;
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const logs = (err as { logs?: unknown }).logs;
    return [err.message, ...(Array.isArray(logs) ? logs.map(String) : [])].join("\n");
  }
  return String(err);
}

/** Wallet popup closed or "Reject" pressed. */
export function isUserRejection(err: unknown): boolean {
  return /user rejected|rejected the request|user denied|cancel+ed|closed the modal/i.test(errorText(err));
}

/** `create_order` hit an existing `order_id`: the caller retries with a new one (01 §5.2). */
export function isOrderIdCollision(err: unknown): boolean {
  if (isVaultixError(err, "AccountAlreadyInUse")) return true;
  return programErrorName(errorText(err)) === "AccountAlreadyInUse";
}

/** A failure whose message is already written for the user (Spanish, actionable). */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export function txErrorMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (isUserRejection(err)) return "Cancelaste la operación. No se movió nada.";
  if (isVaultixError(err)) return PROGRAM_MESSAGES[err.code] ?? GENERIC;
  const name = programErrorName(errorText(err));
  if (name) return PROGRAM_MESSAGES[name] ?? GENERIC;
  // The API already speaks Spanish (and explains rate limits, sessions…).
  if (err instanceof ApiClientError) return err.message;
  return GENERIC;
}
