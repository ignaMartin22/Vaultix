"use client";

import { PublicKey } from "@solana/web3.js";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/lib/auth/session";
import { saveShipment } from "@/lib/order-client";
import { CARRIER_LABELS, CARRIERS, trackingHash, type Carrier } from "@/lib/tracking";
import { useVaultixTx, vaultixKeys } from "@/lib/tx/useVaultixTx";

const PHASE = { signing: "Confirmá en tu cuenta…", sending: "Enviando…", confirming: "Confirmando…" } as const;

/**
 * "Marcá como enviado" (03 §5.3): carrier + number, both optional in the MVP.
 * The number's hash goes on-chain with `mark_shipped`; the number itself to
 * the API, which checks it against that hash.
 */
export function ShipForm({ orderPda }: { orderPda: string }) {
  const session = useSession();
  const toast = useToast();
  const [carrier, setCarrier] = useState<Carrier>("andreani");
  const [number, setNumber] = useState("");
  const tracking = number.trim();

  const ship = useVaultixTx({
    signer: session.pubkey,
    successMessage: "Listo: le avisamos al comprador que lo despachaste.",
    invalidate: [vaultixKeys.order(orderPda), ["shipment", orderPda]],
    build: async (client) =>
      client.buildMarkShippedTx({
        order: new PublicKey(orderPda),
        seller: session.pubkey!,
        trackingHash: tracking ? await trackingHash(carrier, tracking) : null,
      }),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const outcome = await ship.run();
    if (!outcome.ok || !tracking) return;
    try {
      await saveShipment(orderPda, carrier, tracking, session.getAccessToken);
    } catch {
      toast.show("Quedó despachado, pero no pudimos guardar el seguimiento. Probá cargarlo de nuevo.", "error");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h2 className="font-display text-title text-bone">¿Ya lo despachaste?</h2>
      <SelectField id="ship-carrier" label="Correo" value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)}>
        {CARRIERS.map((c) => (
          <option key={c} value={c}>
            {CARRIER_LABELS[c]}
          </option>
        ))}
      </SelectField>
      <Field
        label="Número de seguimiento (opcional)"
        placeholder="AND-48213"
        className="font-mono"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        hint="Con el seguimiento, el comprador sigue el paquete y vos tenés una prueba si hay un reclamo."
      />
      <Button fullWidth type="submit" disabled={ship.busy}>
        {ship.phase in PHASE ? PHASE[ship.phase as keyof typeof PHASE] : "Marcá como enviado"}
      </Button>
    </form>
  );
}
