"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatUsdc } from "@/lib/amounts";
import { whatsappUrl } from "@/lib/sell";

export interface SellSuccessProps {
  link: string;
  title: string;
  amount: bigint;
  onCreateAnother: () => void;
}

/** Done: the link, plus sharing by WhatsApp or copying it (03 §5.2). */
export function SellSuccess({ link, title, amount, onCreateAnother }: SellSuccessProps) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show("Link copiado.", "success");
    } catch {
      toast.show("No pudimos copiarlo. Mantené apretado el link para copiarlo a mano.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-semibold">Tu link está listo</h1>
        <p className="text-steel">Mandáselo a tu comprador. Cuando pague, la plata queda en bóveda y te avisamos.</p>
      </div>

      <Card className="flex flex-col gap-1">
        <span className="text-body text-bone">{title}</span>
        <span className="font-mono text-bone">{formatUsdc(amount)}</span>
        <span className="break-all font-mono text-label text-steel">{link}</span>
      </Card>

      <div className="flex flex-col gap-3">
        <a
          href={whatsappUrl(title, amount, link)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-ion-blue px-5 text-body font-medium text-bone hover:bg-ion-blue/90"
        >
          Compartí por WhatsApp
        </a>
        <Button variant="secondary" onClick={() => void copy()}>
          Copiar link
        </Button>
        <Button variant="secondary" onClick={onCreateAnother}>
          Crear otro link
        </Button>
      </div>
    </div>
  );
}
