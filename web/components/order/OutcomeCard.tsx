import { formatUsdc } from "@/lib/amounts";
import { computeReleaseSplit } from "@/lib/fees";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { StateNote } from "./StateNote";

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

/** One row of the final breakdown: who got what, amount in mono. */
function Line({ label, amount, muted }: { label: string; amount: bigint; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-steel/15 py-2.5">
      <dt className={muted ? "text-steel" : "text-bone"}>{label}</dt>
      <dd className={`font-mono tabular-nums ${muted ? "text-steel" : "text-bone"}`}>{formatUsdc(amount)}</dd>
    </div>
  );
}

export function OutcomeCard({ order, role, resolution }: OutcomeCardProps) {
  const { sellerNet, fee } = computeReleaseSplit(order.amount, order.feeBps);

  switch (order.status) {
    case "Released":
      return (
        <StateNote title="Pago liberado.">
          <p>
            {role === "seller" ? "Cobraste. La operación está cerrada." : "El vendedor cobró. La compra está cerrada."}
          </p>
          <dl className="mt-2">
            <Line label={role === "seller" ? "Cobraste" : "Cobró el vendedor"} amount={sellerNet} />
            <Line label="Comisión" amount={fee} muted />
          </dl>
        </StateNote>
      );
    case "Refunded":
      return (
        <StateNote title="Reembolsado.">
          <p>
            {role === "buyer"
              ? "Te devolvimos todo. No se cobró comisión."
              : "El comprador recibió todo de vuelta porque no se despachó a tiempo."}
          </p>
          <dl className="mt-2">
            <Line label={role === "buyer" ? "Te devolvimos" : "Recibió el comprador"} amount={order.amount} />
          </dl>
        </StateNote>
      );
    default:
      return (
        <StateNote title="Reclamo resuelto.">
          {resolution ? (
            <>
              <dl className="mt-1">
                <Line label="Comprador" amount={resolution.buyerAmount} />
                <Line label="Vendedor" amount={resolution.sellerAmount} />
                <Line label="Comisión" amount={resolution.fee} muted />
              </dl>
              <p className="text-label">Los montos incluyen el depósito del reclamo.</p>
            </>
          ) : (
            <p>El árbitro decidió cómo se repartió el pago. Ya está en las cuentas de cada uno.</p>
          )}
        </StateNote>
      );
  }
}
