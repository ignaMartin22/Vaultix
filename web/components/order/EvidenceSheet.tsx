"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { ApiClientError } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import { shortAddress } from "@/lib/format";
import { addEvidence, listEvidence } from "@/lib/order-client";

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

  const items = useQuery({ queryKey: key, queryFn: () => listEvidence(orderPda, session.getAccessToken) });

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
        await addEvidence(orderPda, me, { kind, file, note: note.trim() || undefined }, session.getAccessToken);
      } else {
        await addEvidence(orderPda, me, { kind: "note", note: note.trim() }, session.getAccessToken);
      }
      await queryClient.invalidateQueries({ queryKey: key });
      toast.show("Listo: subiste tu evidencia.", "success");
      setNote("");
      setFile(null);
      setOpen(false);
    } catch (err) {
      toast.show(err instanceof ApiClientError ? err.message : "No pudimos subirla. Probá de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-subtitle font-semibold">Evidencia</h2>
      {(items.data ?? []).length === 0 ? (
        <p className="text-steel">Todavía no hay evidencia. Subí lo que muestre qué pasó.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.data!.map((item) => (
            <li key={item.id}>
              <Card className="flex flex-col gap-2">
                <span className="text-label text-steel">
                  {item.uploader === session.pubkey?.toBase58()
                    ? "Vos"
                    : item.uploader === sellerPubkey
                      ? "Vendedor"
                      : `Comprador (${shortAddress(item.uploader)})`}
                </span>
                {item.kind === "photo" && item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
                  <img src={item.url} alt="Evidencia" className="max-h-64 rounded-xl object-contain" />
                ) : null}
                {item.kind === "video" && item.url ? (
                  <video src={item.url} controls className="max-h-64 rounded-xl" />
                ) : null}
                {item.note ? <p className="whitespace-pre-line text-body text-bone">{item.note}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Subí evidencia
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Subí evidencia">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-body text-bone">
            Foto o video (opcional)
            <input
              type="file"
              accept={TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-steel file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-graphite file:px-4 file:text-bone"
            />
          </label>
          <label className="flex flex-col gap-2 text-body text-bone">
            Contá qué pasó
            <textarea
              value={note}
              rows={4}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Llegó con el cierre roto. Adjunto foto."
              className="rounded-xl border border-steel/40 bg-vault-black px-4 py-3 text-bone placeholder:text-steel focus:border-ion-blue focus:outline-none"
            />
          </label>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Subiendo…" : "Subir"}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
