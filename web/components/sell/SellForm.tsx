"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Amount } from "@/components/Amount";
import { LinkPreview } from "@/components/LinkPreview";
import { RulesSummary } from "@/components/RulesSummary";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Feedback";
import { Field, TextAreaField } from "@/components/ui/Field";
import { formatUsdc } from "@/lib/amounts";
import { validatePrice } from "@/lib/sell";
import type { ConfigAccount } from "@/lib/vaultix/contract";

import { PhotoPicker } from "./PhotoPicker";

export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 1000;

export interface SellFormValues {
  title: string;
  description: string;
  amount: bigint;
  photos: File[];
}

export interface SellFormProps {
  config: ConfigAccount;
  initial?: Partial<SellFormValues> & { priceText?: string };
  busy: boolean;
  /** What's happening while busy ("Subiendo fotos…"), shown on the button. */
  progress?: string | null;
  onSubmit: (values: SellFormValues, priceText: string) => void;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-6 border-t border-steel/15 pt-6">
      <legend className="float-left mb-6 flex w-full items-baseline gap-3">
        <span className="font-mono text-label text-steel">{String(n).padStart(2, "0")}</span>
        <span className="font-display text-title text-bone">{title}</span>
      </legend>
      <div className="clear-both flex flex-col gap-6">{children}</div>
    </fieldset>
  );
}

/** One step: photos, title, description, price, and the rules before creating (03 §5.2). */
export function SellForm({ config, initial, busy, progress, onSubmit }: SellFormProps) {
  const [photos, setPhotos] = useState<File[]>(initial?.photos ?? []);
  const [photoError, setPhotoError] = useState<string>();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceText, setPriceText] = useState(initial?.priceText ?? "");
  const [touched, setTouched] = useState(false);

  const price = priceText ? validatePrice(priceText, config.maxOrderAmount) : {};
  const titleError = touched && title.trim().length === 0 ? "Poné un título." : undefined;
  const priceError = touched && !priceText ? "Poné el precio." : price.error;
  const photosMissing = touched && photos.length === 0 ? "Subí al menos una foto." : undefined;

  // The cover for the preview; its own object URL, released when it changes.
  const cover = useMemo(() => (photos[0] ? URL.createObjectURL(photos[0]) : null), [photos]);
  useEffect(() => () => (cover ? URL.revokeObjectURL(cover) : undefined), [cover]);
  // Rendered only after the config loads on the client, never on the server.
  const host = typeof window === "undefined" ? "vaultix" : window.location.host;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (photos.length === 0 || !title.trim() || price.amount === undefined) return;
    onSubmit({ title: title.trim(), description: description.trim(), amount: price.amount, photos }, priceText);
  }

  return (
    <form onSubmit={submit} className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20" noValidate>
      <div className="flex flex-col gap-12">
        <Step n={1} title="El producto">
          <PhotoPicker photos={photos} onChange={setPhotos} error={photoError ?? photosMissing} onError={setPhotoError} />
          <Field
            label="Qué vendés"
            placeholder="Campera de cuero talle M"
            value={title}
            maxLength={MAX_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError}
          />
          <TextAreaField
            id="sell-description"
            label={
              <>
                Descripción <span className="font-normal text-steel">(opcional)</span>
              </>
            }
            value={description}
            maxLength={MAX_DESCRIPTION}
            rows={3}
            placeholder="Estado, talle, qué incluye…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </Step>

        <Step n={2} title="El precio">
          <div className="flex flex-col gap-3">
            <Field
              label="Precio en USDC"
              inputMode="decimal"
              placeholder="120,50"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              error={priceError}
              hint={`1 USDC ≈ 1 dólar. Máximo ${formatUsdc(config.maxOrderAmount)}.`}
              className="font-mono tabular-nums"
            />
            {price.amount !== undefined ? <Amount units={price.amount} /> : null}
          </div>
        </Step>

        <Step n={3} title="Las reglas">
          {price.amount !== undefined ? (
            <RulesSummary
              role="seller"
              amount={price.amount}
              feeBps={config.feeBps}
              disputeDepositBps={config.disputeDepositBps}
              shipDeadlineSecs={config.shipDeadlineSecs}
              claimWindowSecs={config.claimWindowSecs}
            />
          ) : (
            <p className="text-body text-steel">Poné el precio y te mostramos cuánto recibís y los plazos.</p>
          )}
        </Step>

        <div className="flex flex-col gap-3 border-t border-steel/15 pt-6" aria-live="polite">
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner className="size-4" /> : null}
            {busy ? (progress ?? "Preparando tu link…") : "Creá el link de pago"}
          </Button>
          {!busy ? (
            <p className="text-label text-steel">La comisión se cobra solo cuando cobrás.</p>
          ) : null}
        </div>
      </div>

      <aside className="hidden lg:block" aria-label="Vista previa">
        <div className="sticky top-8 flex flex-col gap-3">
          <span className="font-mono text-label uppercase text-steel">Así lo ve tu comprador</span>
          <LinkPreview
            title={title.trim()}
            amount={price.amount !== undefined ? formatUsdc(price.amount) : null}
            photoUrl={cover}
            address={`${host}/p/…`}
          />
          <p className="text-label text-steel">Esta vista aparece cuando compartís el link por WhatsApp o Instagram.</p>
        </div>
      </aside>
    </form>
  );
}
