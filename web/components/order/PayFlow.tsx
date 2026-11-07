"use client";

import { PublicKey } from "@solana/web3.js";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatUsdc } from "@/lib/amounts";
import { ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import { saveShippingAddress, type ShippingAddress } from "@/lib/listings-client";
import { useVaultixTx, vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";
import type { OrderAccount } from "@/lib/vaultix/contract";

import { ShippingForm } from "./ShippingForm";
import { TopUpSheet } from "./TopUpSheet";

type Step = "start" | "shipping" | "paying";

const PAY_COPY = {
  signing: "Confirmá en tu cuenta…",
  sending: "Enviando…",
  confirming: "Confirmando…",
} as const;

/**
 * `Created`, buyer side (03 §5.3): "Pagá USDC X" → login → top up if short →
 * shipping address → `pay`. The first one to pay becomes the buyer.
 */
export function PayFlow({ orderPda, order }: { orderPda: string; order: OrderAccount }) {
  const session = useSession();
  const toast = useToast();
  const [step, setStep] = useState<Step>("start");
  const [topUp, setTopUp] = useState(false);
  const [checking, setChecking] = useState(false);
  const pda = new PublicKey(orderPda);

  const pay = useVaultixTx({
    signer: session.pubkey,
    successMessage: "Listo: tu plata está en bóveda.",
    invalidate: [vaultixKeys.order(orderPda), ...(session.pubkey ? [vaultixKeys.balance(session.pubkey.toBase58())] : [])],
    build: (client) => client.buildPayTx({ order: pda, buyer: session.pubkey! }),
    onConfirmed: () => setStep("start"),
  });

  async function start() {
    if (!session.authenticated || !session.pubkey) return session.login();
    setChecking(true);
    try {
      const balance = await getVaultixClient().getUsdcBalance(session.pubkey);
      if (balance < order.amount) setTopUp(true);
      else setStep("shipping");
    } finally {
      setChecking(false);
    }
  }

  const onEnough = useCallback(() => {
    setTopUp(false);
    setStep("shipping");
  }, []);

  async function submitShipping(address: ShippingAddress) {
    setStep("paying");
    try {
      await saveShippingAddress(orderPda, address, session.getAccessToken);
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : "No pudimos guardar tus datos de envío. Probá de nuevo.", "error");
      setStep("shipping");
      return;
    }
    const outcome = await pay.run();
    if (!outcome.ok) setStep("shipping");
  }

  if (session.pubkey?.equals(order.seller)) return null;

  return (
    <div className="flex flex-col gap-4">
      {step === "start" ? (
        <div className="flex flex-col gap-3">
          <Button fullWidth onClick={() => void start()} disabled={checking}>
            {checking ? "Revisando tu saldo…" : `Pagá ${formatUsdc(order.amount)}`}
          </Button>
          <p className="text-center text-label text-steel">Tu plata queda en bóveda hasta que confirmes que llegó.</p>
        </div>
      ) : (
        <section className="flex flex-col gap-5 rounded-2xl border border-steel/15 bg-graphite p-5 animate-[vault-fade_300ms_ease-out] sm:p-6">
          <h2 className="font-display text-title text-bone">¿Dónde te lo mandan?</h2>
          <ShippingForm
            busy={step === "paying"}
            submitLabel={
              step === "paying" && pay.phase in PAY_COPY
                ? PAY_COPY[pay.phase as keyof typeof PAY_COPY]
                : `Pagá ${formatUsdc(order.amount)}`
            }
            onSubmit={(a) => void submitShipping(a)}
          />
        </section>
      )}

      {session.pubkey ? (
        <TopUpSheet
          open={topUp}
          onClose={() => setTopUp(false)}
          owner={session.pubkey}
          needed={order.amount}
          onEnough={onEnough}
        />
      ) : null}
    </div>
  );
}
