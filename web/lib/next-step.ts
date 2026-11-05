/**
 * The one line each card in `/orders` shows (03 §5.5): what's next for you,
 * or the deadline, from the on-chain status. `urgent` paints it ember.
 */
import { activeDeadline, deadlineState, formatShortDate } from "./deadlines";
import type { OrderAccount } from "./vaultix/contract";

export interface NextStep {
  text: string;
  urgent: boolean;
  /** You have something to do (vs. just waiting). */
  action: boolean;
}

export function nextStep(order: OrderAccount | null, role: "seller" | "buyer", now: bigint): NextStep {
  if (!order) return { text: "Cerrada", urgent: false, action: false };
  const deadline = activeDeadline(order);
  const state = deadline ? deadlineState(deadline.at, now) : null;
  const date = deadline ? formatShortDate(deadline.at) : "";
  const urgent = state?.urgent ?? false;
  const step = (text: string, action = false): NextStep => ({ text, urgent, action });

  if (role === "seller") {
    switch (order.status) {
      case "Created":
        return step("Esperando el pago");
      case "Paid":
        return state?.expired ? step("Venció el plazo para despachar") : step(`Despachá antes del ${date}`, true);
      case "Shipped":
        return state?.expired ? step("Ya podés cobrar", true) : step(`Se libera el ${date}`);
      case "Disputed":
        return step("Reclamo abierto: subí tu evidencia", true);
      case "Released":
        return step("Cobraste");
      case "Refunded":
        return step("Reembolsada al comprador");
      case "Resolved":
        return step("Reclamo resuelto");
    }
  }
  switch (order.status) {
    case "Created":
      return step("Sin pagar");
    case "Paid":
      return state?.expired ? step("Pedí el reembolso", true) : step(`Lo despachan antes del ${date}`);
    case "Shipped":
      return state?.expired ? step("Venció el plazo para reclamar") : step(`Confirmá cuando llegue (hasta el ${date})`, true);
    case "Disputed":
      return step("Reclamo abierto: subí tu evidencia", true);
    case "Released":
      return step("Compra cerrada");
    case "Refunded":
      return step("Te devolvimos la plata");
    case "Resolved":
      return step("Reclamo resuelto");
  }
}
