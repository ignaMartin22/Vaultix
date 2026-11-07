import type { ReactNode } from "react";

import { ArsApprox } from "@/components/ArsApprox";
import { LinkPreview } from "@/components/LinkPreview";
import { formatUsdc } from "@/lib/amounts";

/** Example only: a reserved-style domain, never a real one. */
export const EXAMPLE_DOMAIN = "vaultix.example";
const EXAMPLE_AMOUNT = 120_000_000n;

function Bubble({
  from,
  time,
  children,
}: {
  from: "buyer" | "seller";
  time: string;
  children: ReactNode;
}) {
  const seller = from === "seller";
  return (
    <li className={`flex ${seller ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[88%] flex-col gap-2 rounded-2xl px-3 pb-2 pt-3 text-body text-bone ${
          seller
            ? "rounded-br-md bg-[color-mix(in_srgb,var(--ion-blue)_18%,var(--graphite))]"
            : "rounded-bl-md bg-vault-black"
        }`}
      >
        <span className="sr-only">{seller ? "Vendedor:" : "Comprador:"}</span>
        {children}
        <span className="self-end font-mono text-label text-steel">{time}</span>
      </div>
    </li>
  );
}

/**
 * The link where it actually travels (05 §9): a chat. The buyer's doubt
 * comes first, so the link is the answer to a real fear, and the preview
 * sits inside the seller's message, as messaging apps show it.
 */
export function ChatExample({ className = "" }: { className?: string }) {
  return (
    <figure
      aria-label="Ejemplo de una conversación por chat"
      className={`flex flex-col overflow-hidden rounded-3xl border border-steel/15 bg-graphite ${className}`}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-steel/15 px-5 py-4">
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-vault-black text-body text-steel"
          >
            L
          </span>
          <span className="flex flex-col">
            <span className="text-body font-medium text-bone">Lucía</span>
            <span className="text-label text-steel">Compradora</span>
          </span>
        </span>
        <span className="font-mono text-label uppercase text-steel">Ejemplo</span>
      </figcaption>

      <ol className="flex flex-col gap-3 p-4 sm:p-5">
        <Bubble from="buyer" time="18:40">
          <p>Hola, me interesa la campera. ¿Cómo te pago? No te conozco.</p>
        </Bubble>
        <Bubble from="seller" time="18:42">
          <LinkPreview
            className="border-steel/25"
            title="Campera de cuero · Talle M"
            amount={formatUsdc(EXAMPLE_AMOUNT)}
            amountNote={<ArsApprox units={EXAMPLE_AMOUNT} />}
            address={EXAMPLE_DOMAIN}
          />
          <p className="text-pretty">
            Te paso el link, pagás ahí y la plata queda trabada hasta que te llegue.
          </p>
        </Bubble>
        <Bubble from="buyer" time="18:47">
          <p>Listo, pagué. Dice que la plata está en bóveda hasta que confirme que llegó.</p>
        </Bubble>
      </ol>
    </figure>
  );
}
