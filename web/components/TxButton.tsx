"use client";

import { Button, type ButtonVariant } from "@/components/ui/Button";
import { useVaultixTx, type UseVaultixTxOptions } from "@/lib/tx/useVaultixTx";
import type { TxPhase } from "@/lib/tx/run";

/** Copy per phase (03 §4). `idle` and `failed` show the action itself. */
const PHASE_LABEL: Partial<Record<TxPhase, string>> = {
  signing: "Confirmá en tu cuenta…",
  sending: "Enviando…",
  confirming: "Confirmando…",
};

export interface TxButtonProps extends UseVaultixTxOptions {
  /** The action, first the data: "Pagá USDC 120.00". */
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}

/** Runs one Vaultix transaction and shows where it is. Errors go to a toast and below the button. */
export function TxButton({ label, variant, disabled, className, ...txOptions }: TxButtonProps) {
  const { phase, error, busy, run } = useVaultixTx(txOptions);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <Button
        variant={variant}
        className={className}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={() => void run()}
      >
        {PHASE_LABEL[phase] ?? label}
      </Button>
      {phase === "failed" && error ? (
        <p role="alert" className="text-label text-plasma">
          {error}
        </p>
      ) : null}
    </div>
  );
}
