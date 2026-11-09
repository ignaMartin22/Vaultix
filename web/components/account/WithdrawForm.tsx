"use client";

import type { PublicKey } from "@solana/web3.js";
import { useState, type FormEvent } from "react";

import { TxButton } from "@/components/TxButton";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { formatAmount, formatUsdc } from "@/lib/amounts";
import { vaultixKeys } from "@/lib/tx/useVaultixTx";
import {
  MIN_WITHDRAW_UNITS,
  WITHDRAW_DAILY_LIMIT,
  validateWithdrawAmount,
  validateWithdrawDestination,
} from "@/lib/withdraw";

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
 * Send USDC to another app (Lemon, Ripio, Phantom). Two steps: what and where,
 * then a review that says exactly what will happen, because it can't be undone.
 * Vaultix pays the network fee (owner decision, option A).
 */
export function WithdrawForm({ owner, balance }: WithdrawFormProps) {
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

  if (pending) {
    return (
      <div className="flex flex-col gap-5">
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
            invalidate={[vaultixKeys.balance(owner.toBase58())]}
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
          hint={`Mínimo ${formatUsdc(MIN_WITHDRAW_UNITS)}. Hasta ${WITHDRAW_DAILY_LIMIT} retiros por día.`}
          className="font-mono tabular-nums"
          autoComplete="off"
          onSurface
        />
        <button
          type="button"
          onClick={() => setAmountText(formatAmount(balance))}
          disabled={tooLittle}
          className="link min-h-11 self-start text-body disabled:opacity-50"
        >
          Retirar todo ({formatUsdc(balance)})
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
