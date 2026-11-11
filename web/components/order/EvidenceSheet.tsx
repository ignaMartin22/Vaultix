"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import { shortAddress } from "@/lib/format";
import { addEvidence, listEvidence } from "@/lib/order-client";
import { LIVE_POLL_MS } from "@/lib/order-status";

const MAX_BYTES = 50 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

/** Evidence of both parties (03 §5.3, `Disputed`): the list plus "Subí evidencia". */
export function Evidence({ orderPda, sellerPubkey }: { orderPda: string; sellerPubkey: string }) {
  const session = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ["evidence", orderPda];

  const items = useQuery({
    queryKey: key,
    queryFn: () => listEvidence(orderPda, session.getAccessToken),
    // The other side uploads from their own phone: show it without reloading.
    refetchInterval: LIVE_POLL_MS * 2,
  });

  async function submit() {
    if (!session.pubkey) return;
    if (!file && !note.trim()) return toast.show("Agregá una foto, un video o una nota.", "error");
    if (file && (!TYPES.includes(file.type) || file.size > MAX_BYTES)) {
      return toast.show("Subí una foto o un video de hasta 50 MB.", "error");
    }
    setBusy(true);
    try {
      const me = session.pubkey.toBase58();
      if (file) {
        const kind = file.type.startsWith("video/") ? "video" : "photo";
        await addEvidence(
          orderPda,
          me,
          { kind, file, note: note.trim() || undefined },
          session.getAccessToken,
        );
      } else {
        await addEvidence(
          orderPda,
          me,
          { kind: "note", note: note.trim() },
          session.getAccessToken,
        );
      }
      await queryClient.invalidateQueries({ queryKey: key });
      toast.show("Listo: subiste tu evidencia.", "success");
      setNote("");
      setFile(null);
      setOpen(false);
    } catch (err) {
      toast.show(
        err instanceof ApiClientError ? err.message : "No pudimos subirla. Probá de nuevo.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="evidence-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="evidence-title" className="font-display text-title text-bone">
          Evidencia
        </h2>
        {(items.data ?? []).length > 0 ? (
          <span className="font-mono text-label uppercase text-steel">
            {items.data!.length} en total
          </span>
        ) : null}
      </div>
      {(items.data ?? []).length === 0 ? (
        <p className="text-body text-steel">
          Todavía no hay evidencia. Subí lo que muestre qué pasó.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.data!.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 border-t border-steel/15 py-4">
              {/* Not uppercase: it can carry a case-sensitive address. */}
              <span className="font-mono text-label text-steel">
                {item.uploader === session.pubkey?.toBase58()
                  ? "Vos"
                  : item.uploader === sellerPubkey
                    ? "Vendedor"
                    : `Comprador (${shortAddress(item.uploader)})`}
              </span>
              {item.kind === "photo" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
                <img
                  src={item.url}
                  alt="Evidencia"
                  className="max-h-72 self-start rounded-xl bg-graphite object-contain"
                />
              ) : null}
              {item.kind === "video" && item.url ? (
                <video
                  src={item.url}
                  controls
                  className="max-h-72 self-start rounded-xl bg-graphite"
                />
              ) : null}
              {item.note ? (
                <p className="whitespace-pre-line text-body text-bone">{item.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Button fullWidth variant="secondary" onClick={() => setOpen(true)}>
        Subí evidencia
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Subí evidencia">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-body font-medium text-bone">
            Foto o video (opcional)
            <input
              type="file"
              accept={TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-xl border border-dashed border-steel/40 bg-vault-black p-2 text-label font-normal text-steel file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-graphite file:px-4 file:text-body file:text-bone focus-within:border-ion-blue"
            />
            <span className="text-label font-normal text-steel">
              JPG, PNG, WebP, MP4 o MOV de hasta 50 MB.
            </span>
          </label>
          <TextAreaField
            label="Contá qué pasó"
            value={note}
            rows={4}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Llegó con el cierre roto. Adjunto foto."
            onSurface
          />
          <Button fullWidth disabled={busy} onClick={() => void submit()}>
            {busy ? "Subiendo…" : "Subí la evidencia"}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
