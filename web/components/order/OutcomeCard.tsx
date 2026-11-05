import { Card } from "@/components/ui/Card";
import { formatUsdc } from "@/lib/amounts";
import { computeReleaseSplit } from "@/lib/fees";
import type { OrderAccount } from "@/lib/vaultix/contract";

/** Final states (03 §5.3): what happened, with amounts from the order's snapshot. */
export interface Resolution {
  buyerAmount: bigint;
  sellerAmount: bigint;
  fee: bigint;
}

export interface OutcomeCardProps {
  order: OrderAccount;
  role: "buyer" | "seller" | "other";
  /** From the DisputeResolved event, when we have it (mock now, indexed events later). */
  resolution?: Resolution | null;
}

export function OutcomeCard({ order, role, resolution }: OutcomeCardProps) {
  const { sellerNet, fee } = computeReleaseSplit(order.amount, order.feeBps);

  let title: string;
  let detail: string;
  switch (order.status) {
    case "Released":
      title = "Pago liberado";
      detail =
        role === "seller"
          ? `Cobraste ${formatUsdc(sellerNet)}. La comisión fue ${formatUsdc(fee)}.`
          : `El vendedor cobró ${formatUsdc(sellerNet)}. La compra está cerrada.`;
      break;
    case "Refunded":
      title = "Reembolsado";
      detail =
        role === "buyer"
          ? `Te devolvimos ${formatUsdc(order.amount)}. No se cobró comisión.`
          : `El comprador recibió ${formatUsdc(order.amount)} de vuelta porque no se despachó a tiempo.`;
      break;
    default:
      title = "Reclamo resuelto";
      detail = resolution
        ? `El comprador recibió ${formatUsdc(resolution.buyerAmount)} y el vendedor ${formatUsdc(resolution.sellerAmount)} (depósito incluido). Comisión: ${formatUsdc(resolution.fee)}.`
        : "El árbitro decidió cómo se repartió el pago. Ya está en las cuentas de cada uno.";
  }

  return (
    <Card className="flex flex-col gap-1">
      <span className="text-subtitle font-semibold">{title}</span>
      <span className="text-body text-steel">{detail}</span>
    </Card>
  );
}
