"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { ShippingAddress } from "@/lib/listings-client";

export interface ShippingFormProps {
  busy: boolean;
  submitLabel: string;
  onSubmit: (address: ShippingAddress) => void;
}

const EMPTY: ShippingAddress = {
  fullName: "",
  phone: "",
  street: "",
  city: "",
  province: "",
  postalCode: "",
  notes: "",
};

const REQUIRED: (keyof ShippingAddress)[] = ["fullName", "phone", "street", "city", "province", "postalCode"];

/** Where to send it, before paying (01 §5.3). Only the seller sees it, and only after you pay. */
export function ShippingForm({ busy, submitLabel, onSubmit }: ShippingFormProps) {
  const [address, setAddress] = useState<ShippingAddress>(EMPTY);
  const [touched, setTouched] = useState(false);

  const set = (key: keyof ShippingAddress) => (e: { target: { value: string } }) =>
    setAddress((a) => ({ ...a, [key]: e.target.value }));
  const missing = (key: keyof ShippingAddress) => (touched && !address[key].trim() ? "Completalo." : undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (REQUIRED.some((k) => !address[k].trim())) return;
    onSubmit(address);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <p className="text-body text-steel">El vendedor ve estos datos recién cuando pagás.</p>
      <Field onSurface label="Nombre y apellido" autoComplete="name" value={address.fullName} onChange={set("fullName")} error={missing("fullName")} />
      <Field onSurface label="Teléfono" type="tel" autoComplete="tel" value={address.phone} onChange={set("phone")} error={missing("phone")} />
      <Field onSurface label="Dirección" autoComplete="street-address" value={address.street} onChange={set("street")} error={missing("street")} />
      <div className="grid grid-cols-2 gap-3">
        <Field onSurface label="Ciudad" autoComplete="address-level2" value={address.city} onChange={set("city")} error={missing("city")} />
        <Field onSurface label="Código postal" autoComplete="postal-code" value={address.postalCode} onChange={set("postalCode")} error={missing("postalCode")} />
      </div>
      <Field onSurface label="Provincia" autoComplete="address-level1" value={address.province} onChange={set("province")} error={missing("province")} />
      <Field onSurface label="Notas (opcional)" value={address.notes} onChange={set("notes")} placeholder="Piso, timbre, horario…" />
      <Button fullWidth type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
