/** Pure helpers of `/sell` (03 §5.2), kept out of the components to test them. */
import { AmountParseError, formatUsdc, parseAmount } from "./amounts";

const AMOUNT_ERRORS: Record<AmountParseError["reason"], string> = {
  empty: "Poné el precio.",
  invalid: "Escribí el precio con números, por ejemplo 120,50.",
  too_many_decimals: "Usá hasta 6 decimales.",
  too_large: "El precio es demasiado alto.",
};

/** The price text → units, or the Spanish error to show under the field. */
export function validatePrice(text: string, maxOrderAmount: bigint): { amount?: bigint; error?: string } {
  try {
    const amount = parseAmount(text);
    if (amount <= 0n) return { error: "El precio tiene que ser mayor a 0." };
    if (amount > maxOrderAmount) return { error: `El máximo por link es ${formatUsdc(maxOrderAmount)}.` };
    return { amount };
  } catch (err) {
    if (err instanceof AmountParseError) return { error: AMOUNT_ERRORS[err.reason] };
    throw err;
  }
}

/** WhatsApp share link with the product, the price and the payment link. */
export function whatsappUrl(title: string, amount: bigint, link: string): string {
  const text = `${title} · ${formatUsdc(amount)}. Pagá protegido con Vaultix: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
