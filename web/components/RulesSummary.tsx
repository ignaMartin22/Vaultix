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

/** "5 días" from a duration in seconds. */
export function days(secs: bigint): string {
  const n = Number(secs / 86_400n);
  return n === 1 ? "1 día" : `${n} días`;
}

/** "1,5%" from basis points. */
export function percent(bps: number): string {
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
    <div className="flex flex-col rounded-2xl border border-steel/15 bg-graphite">
      <ol className="flex flex-col px-5 sm:px-6">
        {lines.map((line, i) => (
          <li key={line} className="flex gap-4 border-b border-steel/15 py-4 text-body text-bone">
            <span className="font-mono text-label leading-6 text-steel">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-pretty">{line}</span>
          </li>
        ))}
      </ol>
      <details className="group px-5 py-4 text-body text-steel sm:px-6">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-bone [&::-webkit-details-marker]:hidden">
          ¿Cómo funciona?
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 text-steel transition-transform group-open:rotate-180">
            <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <div className="mt-2 flex flex-col gap-3 text-pretty">
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
    </div>
  );
}
