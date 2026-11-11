"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorNote, Loading, PageIntro } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import {
  activateListing,
  createDraft,
  paymentLink,
  rememberMockListing,
  uploadPhotos,
  type Draft,
} from "@/lib/listings-client";
import { USE_MOCK } from "@/lib/vaultix/mode";
import { isOrderIdCollision } from "@/lib/tx/errors";
import type { TxPhase } from "@/lib/tx/run";
import { useVaultixTx, vaultixKeys } from "@/lib/tx/useVaultixTx";
import { getVaultixClient } from "@/lib/vaultix/client";

import { SellForm, type SellFormValues } from "./SellForm";
import { SellSuccess } from "./SellSuccess";
import { LoginHint } from "@/components/LoginHint";

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
  // The cover, for the shared-link preview once it's done.
  const cover = useMemo(() => (values?.photos[0] ? URL.createObjectURL(values.photos[0]) : null), [values]);
  useEffect(() => () => (cover ? URL.revokeObjectURL(cover) : undefined), [cover]);

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

      if (USE_MOCK) rememberMockListing(draft.current!, form, seller);
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
    return <Loading />;
  }

  if (!session.authenticated) {
    return (
      <div className="flex max-w-xl flex-col gap-8">
        <PageIntro eyebrow="Vender" title="Creá tu link de pago">
          Tu comprador paga y la plata queda en bóveda hasta que le llega. Para empezar, entrá con tu email, Google o Phantom.
        </PageIntro>
        <div className="flex flex-col gap-3">
          <Button onClick={session.login}>Entrá para crear tu link</Button>
          <LoginHint />
        </div>
      </div>
    );
  }

  if (!config.data) {
    return <ErrorNote>No pudimos cargar las reglas de la bóveda. Probá de nuevo en un rato.</ErrorNote>;
  }

  if (step === "done" && done) {
    return (
      <SellSuccess
        {...done}
        photoUrl={cover}
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
    <div className="flex flex-col gap-12">
      <PageIntro eyebrow="Vender" title="Creá tu link de pago">
        Tu comprador paga y la plata queda en bóveda hasta que le llega.
      </PageIntro>
      <SellForm
        config={config.data}
        initial={values}
        busy={step !== "form"}
        progress={progress}
        onSubmit={(v, p) => void create(v, p)}
      />
    </div>
  );
}
