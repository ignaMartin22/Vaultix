"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicKey } from "@solana/web3.js";
import { useState, type FormEvent } from "react";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { formatAmount, formatUsdc } from "@/lib/amounts";
import { useSession } from "@/lib/auth/session";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import {
  MIN_WITHDRAW_UNITS,
  validateWithdrawAmount,
  validateWithdrawDestination,
  type WithdrawalsToday,
} from "@/lib/withdraw";
import { getWithdrawalsToday, withdrawalsTodayKey } from "@/lib/withdraw-client";

export interface WithdrawFormProps {
  owner: PublicKey;
  /** Current balance in minimum units, once read. */
  balance: bigint;
}

interface Pending {
  destination: PublicKey;
  amount: bigint;
}

/**
 * Today's sponsored withdrawals, as the sponsor counts them: one mark per
 * allowed withdrawal, lit while still available. The UTC day the counter uses
 * starts at 21:00 in Argentina (UTC−3, no daylight saving).
 */
function WithdrawalsLeft({ usage }: { usage: WithdrawalsToday | undefined }) {
  if (!usage)
    return <p className="text-body text-steel">Revisando cuántos retiros te quedan hoy…</p>;
  const { remaining, limit } = usage;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: limit }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${
                i < remaining
                  ? "bg-[linear-gradient(90deg,var(--ion-blue),var(--ultra-violet))]"
                  : "bg-steel/25"
              }`}
            />
          ))}
        </span>
        <span className="text-body text-bone">
          {remaining === 0
            ? `Ya usaste los ${limit} retiros de hoy.`
            : `Te ${remaining === 1 ? "queda" : "quedan"} ${remaining} de ${limit} retiros hoy.`}
        </span>
      </div>
      <span className="text-label text-steel">
        Se renuevan todos los días a las 21:00 (hora de Argentina).
      </span>
    </div>
  );
}

/**
 * Send USDC to another app (Lemon, Ripio, Phantom). Two steps: what and where,
 * then a review that says exactly what will happen, because it can't be undone.
 * Vaultix pays the network fee (owner decision, option A).
 */
export function WithdrawForm({ owner, balance }: WithdrawFormProps) {
  const session = useSession();
  const usage = useQuery({
    queryKey: withdrawalsTodayKey,
    queryFn: () => getWithdrawalsToday(session.getAccessToken),
  });
  const noneLeft = usage.data?.remaining === 0;
  const [destinationText, setDestinationText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const destination = validateWithdrawDestination(destinationText, owner);
  const amount = validateWithdrawAmount(amountText, balance);
  const tooLittle = balance < MIN_WITHDRAW_UNITS;

  function review(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!destination.destination || amount.amount === undefined) return;
    setPending({ destination: destination.destination, amount: amount.amount });
  }

  function done() {
    setPending(null);
    setDestinationText("");
    setAmountText("");
    setTouched(false);
  }

  if (noneLeft && !pending) {
    return <WithdrawalsLeft usage={usage.data} />;
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-5">
        <WithdrawalsLeft usage={usage.data} />
        <dl className="flex flex-col">
          <div className="flex items-baseline justify-between gap-4 border-t border-steel/15 py-3">
            <dt className="text-steel">Mandás</dt>
            <dd className="font-mono tabular-nums text-bone">{formatUsdc(pending.amount)}</dd>
          </div>
          <div className="flex flex-col gap-1 border-t border-steel/15 py-3">
            <dt className="text-steel">A la dirección</dt>
            <dd className="break-all font-mono text-body text-bone">
              {pending.destination.toBase58()}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-y border-steel/15 py-3">
            <dt className="text-steel">Comisión de la red</dt>
            <dd className="text-bone">La paga Vaultix</dd>
          </div>
        </dl>
        <p className="flex items-start gap-2 text-body text-bone">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-ember" />
          <span>
            Revisá que la dirección sea de la red <strong>Solana</strong> y acepte USDC. Una vez
            enviado, no se puede deshacer.
          </span>
        </p>
        <div className="flex flex-col gap-3">
          <TxButton
            fullWidth
            label={`Retirá ${formatUsdc(pending.amount)}`}
            signer={owner}
            successMessage={`Listo: mandaste ${formatUsdc(pending.amount)}.`}
            invalidate={[vaultixKeys.balance(owner.toBase58()), withdrawalsTodayKey]}
            build={(client) =>
              client.buildWithdrawUsdcTx({
                owner,
                destination: pending.destination,
                amount: pending.amount,
              })
            }
            onConfirmed={done}
          />
          <Button fullWidth variant="secondary" onClick={() => setPending(null)}>
            Volver y corregir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={review} className="flex flex-col gap-5" noValidate>
      <WithdrawalsLeft usage={usage.data} />
      <Field
        label="Dirección de destino"
        placeholder="La dirección de Solana de tu otra app"
        value={destinationText}
        onChange={(e) => setDestinationText(e.target.value)}
        error={touched ? destination.error : undefined}
        hint="En Lemon, Ripio o Phantom: Recibir → USDC → red Solana."
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
        onSurface
      />
      <div className="flex flex-col gap-2">
        <Field
          label="Monto en USDC"
          inputMode="decimal"
          placeholder="10,50"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={touched ? amount.error : undefined}
          hint={`Mínimo ${formatUsdc(MIN_WITHDRAW_UNITS)}.`}
          className="font-mono tabular-nums"
          autoComplete="off"
          onSurface
        />
        <button
          type="button"
          onClick={() => setAmountText(formatAmount(balance))}
          disabled={tooLittle}
          className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-steel/30 bg-vault-black px-4 text-body text-bone transition-colors hover:border-bone disabled:pointer-events-none disabled:opacity-50"
        >
          Usar todo
          <span aria-hidden="true" className="text-steel">
            ·
          </span>
          <span className="font-mono tabular-nums">{formatUsdc(balance)}</span>
        </button>
      </div>
      <Button type="submit" fullWidth disabled={tooLittle}>
        Revisá el retiro
      </Button>
      {tooLittle ? (
        <p className="text-body text-steel">
          Necesitás al menos {formatUsdc(MIN_WITHDRAW_UNITS)} para retirar.
        </p>
      ) : null}
    </form>
  );
}
