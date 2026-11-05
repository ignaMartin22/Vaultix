"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import { activateListing, createDraft, paymentLink, uploadPhotos, type Draft } from "@/lib/listings-client";
import { isOrderIdCollision } from "@/lib/tx/errors";
import type { TxPhase } from "@/lib/tx/run";
import { useVaultixTx, vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";

import { SellForm, type SellFormValues } from "./SellForm";
import { SellSuccess } from "./SellSuccess";

type Step = "form" | "draft" | "photos" | "tx" | "activate" | "done";

const TX_COPY: Partial<Record<TxPhase, string>> = {
  signing: "Confirmá en tu cuenta…",
  sending: "Enviando…",
  confirming: "Confirmando…",
};

const MAX_ORDER_ID_TRIES = 3;
const ACTIVATE_TRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `/sell`: form → draft → photos → create_order → activate → share (01 §5.2). */
export function SellFlow() {
  const session = useSession();
  const toast = useToast();
  const [step, setStep] = useState<Step>("form");
  const [values, setValues] = useState<SellFormValues & { priceText: string }>();
  const [done, setDone] = useState<{ link: string; title: string; amount: bigint }>();
  const draft = useRef<Draft | null>(null);

  const config = useQuery({
    queryKey: vaultixKeys.config,
    queryFn: () => getVaultixClient().getConfig(),
  });

  const tx = useVaultixTx({
    signer: session.pubkey,
    toastErrors: false,
    build: (client) => {
      const d = draft.current!;
      return client.buildCreateOrderTx({
        seller: session.pubkey!,
        orderId: d.orderId,
        amount: values!.amount,
        listingHash: d.listingHash,
      });
    },
  });

  async function create(form: SellFormValues, priceText: string) {
    const seller = session.pubkey;
    if (!seller) return session.login();
    setValues({ ...form, priceText });

    try {
      for (let attempt = 1; ; attempt++) {
        setStep("draft");
        const d = await createDraft(form, seller, session.getAccessToken);
        if (d.uploads.length > 0) {
          setStep("photos");
          await uploadPhotos(d.uploads, form.photos);
        }
        draft.current = d;
        setStep("tx");
        const outcome = await tx.run();
        if (outcome.ok) break;
        // A colliding order_id is our bad luck, not the user's: new draft, new id.
        if (isOrderIdCollision(outcome.error) && attempt < MAX_ORDER_ID_TRIES) continue;
        throw Object.assign(new Error(outcome.message), { userMessage: outcome.message });
      }

      setStep("activate");
      for (let attempt = 1; ; attempt++) {
        try {
          await activateListing(draft.current!, session.getAccessToken);
          break;
        } catch (err) {
          // The RPC behind the API may lag a moment behind our confirmation.
          if (err instanceof ApiClientError && err.code === "not_found" && attempt < ACTIVATE_TRIES) {
            await sleep(1_500);
            continue;
          }
          throw err;
        }
      }

      setDone({
        link: paymentLink(window.location.origin, draft.current!.orderPda),
        title: form.title,
        amount: form.amount,
      });
      setStep("done");
    } catch (err) {
      const message =
        (err as { userMessage?: string }).userMessage ??
        (err instanceof ApiClientError ? err.message : "No pudimos crear el link. Probá de nuevo.");
      toast.show(message, "error");
      setStep("form");
    }
  }

  if (!session.ready || config.isPending) {
    return <p className="text-steel">Cargando…</p>;
  }

  if (!session.authenticated) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-title font-semibold">Creá tu link de pago</h1>
        <p className="text-steel">Entrá con tu email o Google. Tu comprador paga y la plata queda en bóveda hasta que le llega.</p>
        <Button onClick={session.login}>Entrar</Button>
      </div>
    );
  }

  if (!config.data) {
    return <p className="text-plasma">No pudimos cargar las reglas de la bóveda. Probá de nuevo en un rato.</p>;
  }

  if (step === "done" && done) {
    return (
      <SellSuccess
        {...done}
        onCreateAnother={() => {
          draft.current = null;
          setValues(undefined);
          setDone(undefined);
          tx.reset();
          setStep("form");
        }}
      />
    );
  }

  const progress =
    step === "draft"
      ? "Preparando tu link…"
      : step === "photos"
        ? "Subiendo fotos…"
        : step === "tx"
          ? (TX_COPY[tx.phase] ?? "Preparando tu link…")
          : step === "activate"
            ? "Activando tu link…"
            : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Creá tu link de pago</h1>
        <p className="text-steel">Tu comprador paga y la plata queda en bóveda hasta que le llega.</p>
      </div>
      {progress ? (
        <Card role="status" aria-live="polite" className="text-bone">
          {progress}
        </Card>
      ) : null}
      <SellForm config={config.data} initial={values} busy={step !== "form"} onSubmit={(v, p) => void create(v, p)} />
    </div>
  );
}
