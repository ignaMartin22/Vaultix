import { Card } from "@/components/ui/Card";
import { formatUsdc } from "@/lib/amounts";
import { computeReleaseSplit, disputeDepositFor } from "@/lib/fees";

export interface RulesSummaryProps {
  role: "seller" | "buyer";
  amount: bigint;
  feeBps: number;
  disputeDepositBps: number;
  shipDeadlineSecs: bigint;
  claimWindowSecs: bigint;
}

function days(secs: bigint): string {
  const n = Number(secs / 86_400n);
  return n === 1 ? "1 día" : `${n} días`;
}

function percent(bps: number): string {
  return `${(bps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

/**
 * The same short rules for both parties before paying or creating a link
 * (03 §2): concrete amounts and plain durations first, details on demand.
 */
export function RulesSummary(props: RulesSummaryProps) {
  const { role, amount, feeBps, disputeDepositBps, shipDeadlineSecs, claimWindowSecs } = props;
  const { sellerNet, fee } = computeReleaseSplit(amount, feeBps);
  const deposit = disputeDepositFor(amount, disputeDepositBps);

  const lines =
    role === "seller"
      ? [
          `Vas a recibir ${formatUsdc(sellerNet)}. La comisión es ${formatUsdc(fee)} (${percent(feeBps)}).`,
          `Cuando te paguen, tenés ${days(shipDeadlineSecs)} para despacharlo. Si no, le devolvemos todo al comprador.`,
          `Cobrás cuando confirma que le llegó, o solo a los ${days(claimWindowSecs)} del envío si no reclama.`,
        ]
      : [
          `Pagás ${formatUsdc(amount)}. La plata queda en bóveda, no le llega al vendedor todavía.`,
          `Si no lo despacha en ${days(shipDeadlineSecs)}, te devolvemos todo.`,
          `Cuando te llegue, confirmalo. Tenés ${days(claimWindowSecs)} desde el envío para reclamar si algo está mal.`,
        ];

  return (
    <Card className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line} className="text-body text-bone">
            {line}
          </li>
        ))}
      </ul>
      <details className="text-body text-steel">
        <summary className="cursor-pointer text-bone">¿Cómo funciona?</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            El pago queda guardado en una bóveda que nadie puede tocar: ni el vendedor, ni el comprador, ni
            nosotros. Se libera solo con estas reglas.
          </p>
          <p>
            Si hay un problema, el comprador abre un reclamo dejando un depósito de {formatUsdc(deposit)} (
            {percent(disputeDepositBps)}). Las dos partes suben pruebas y un árbitro decide cómo se reparte.
            Si al comprador le toca la mitad o más, el depósito vuelve a él; si no, queda para el vendedor.
          </p>
          <p>La comisión se cobra solo cuando el vendedor cobra. Si hay reembolso, no se cobra nada.</p>
        </div>
      </details>
    </Card>
  );
}
