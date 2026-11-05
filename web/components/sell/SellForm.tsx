"use client";

import { useState, type FormEvent } from "react";

import { Amount } from "@/components/Amount";
import { RulesSummary } from "@/components/RulesSummary";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
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
  onSubmit: (values: SellFormValues, priceText: string) => void;
}

/** One step: photos, title, description, price, and the rules before creating (03 §5.2). */
export function SellForm({ config, initial, busy, onSubmit }: SellFormProps) {
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

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (photos.length === 0 || !title.trim() || price.amount === undefined) return;
    onSubmit({ title: title.trim(), description: description.trim(), amount: price.amount, photos }, priceText);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <PhotoPicker photos={photos} onChange={setPhotos} error={photoError ?? photosMissing} onError={setPhotoError} />

      <Field
        label="Qué vendés"
        placeholder="Campera de cuero talle M"
        value={title}
        maxLength={MAX_TITLE}
        onChange={(e) => setTitle(e.target.value)}
        error={titleError}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="sell-description" className="text-body font-medium text-bone">
          Descripción <span className="text-steel">(opcional)</span>
        </label>
        <textarea
          id="sell-description"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          placeholder="Estado, talle, qué incluye…"
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-xl border border-steel/40 bg-graphite px-4 py-3 text-body text-bone placeholder:text-steel focus:border-ion-blue focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Field
          label="Precio en USDC"
          inputMode="decimal"
          placeholder="120,50"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          error={priceError}
          hint={`1 USDC ≈ 1 dólar. Máximo ${formatUsdc(config.maxOrderAmount)}.`}
        />
        {price.amount !== undefined ? <Amount units={price.amount} /> : null}
      </div>

      {price.amount !== undefined ? (
        <RulesSummary
          role="seller"
          amount={price.amount}
          feeBps={config.feeBps}
          disputeDepositBps={config.disputeDepositBps}
          shipDeadlineSecs={config.shipDeadlineSecs}
          claimWindowSecs={config.claimWindowSecs}
        />
      ) : null}

      <Button type="submit" disabled={busy}>
        Crear link de pago
      </Button>
    </form>
  );
}
