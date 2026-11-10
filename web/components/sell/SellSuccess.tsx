"use client";

import { LinkPreview } from "@/components/LinkPreview";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { PageIntro } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { formatUsdc } from "@/lib/amounts";
import { whatsappUrl } from "@/lib/sell";

export interface SellSuccessProps {
  link: string;
  title: string;
  amount: bigint;
  /** Local preview of the cover, if there is one. */
  photoUrl?: string | null;
  onCreateAnother: () => void;
}

/** Done: the link, plus sharing by WhatsApp or copying it (03 §5.2). */
export function SellSuccess({ link, title, amount, photoUrl, onCreateAnother }: SellSuccessProps) {
  const toast = useToast();
  const address = link.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show("Link copiado.", "success");
    } catch {
      toast.show("No pudimos copiarlo. Mantené apretado el link para copiarlo a mano.", "error");
    }
  }

  return (
    <div className="grid gap-12 animate-[vault-fade_400ms_ease-out] lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
      <div className="flex flex-col gap-10">
        <PageIntro eyebrow="Link creado" title="Tu link está listo.">
          Mandáselo a tu comprador. Cuando pague, la plata queda en bóveda y te avisamos.
        </PageIntro>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-label uppercase text-steel">Tu link</span>
          <button
            type="button"
            onClick={() => void copy()}
            className="group flex items-center justify-between gap-4 rounded-xl border border-steel/40 bg-graphite px-4 py-3 text-left transition-colors hover:border-steel"
          >
            <span className="min-w-0 break-all font-mono text-body text-bone">{address}</span>
            <span className="shrink-0 text-label text-steel transition-colors group-hover:text-bone">Copiar</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ButtonAnchor href={whatsappUrl(title, amount, link)} target="_blank" rel="noopener noreferrer">
            Compartí por WhatsApp
          </ButtonAnchor>
          <Button variant="secondary" onClick={() => void copy()}>
            Copiar link
          </Button>
        </div>

        <div className="flex flex-col gap-4 border-t border-steel/15 pt-6">
          <p className="text-body text-steel">
            Ahí ves si ya te pagaron y qué tenés que hacer después. También lo encontrás en Mis operaciones.
          </p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink href={new URL(link).pathname} variant="secondary">
              Seguí el estado del link
            </ButtonLink>
            <Button variant="ghost" onClick={onCreateAnother}>
              Crear otro link
            </Button>
          </div>
        </div>
      </div>

      <aside aria-label="Vista previa" className="flex flex-col gap-3">
        <span className="font-mono text-label uppercase text-steel">Así se ve al compartirlo</span>
        <LinkPreview title={title} amount={formatUsdc(amount)} photoUrl={photoUrl} address={address} />
      </aside>
    </div>
  );
}
