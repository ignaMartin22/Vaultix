import Link from "next/link";

import { Logo } from "@/components/Logo";
import { SpectralHero } from "@/components/SpectralHero";

const STEPS = [
  { title: "Creá el link", text: "Subí fotos, poné el precio y compartilo por WhatsApp o Instagram." },
  { title: "Tu comprador paga, la plata queda en bóveda", text: "Nadie la puede tocar hasta que se cumplan las reglas." },
  { title: "Cobrás cuando llega", text: "Si no despachás a tiempo, le devolvemos todo al comprador." },
];

/** Landing (03 §5.1): Spectral hero, three steps and the main CTA. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden">
        <SpectralHero />
        {/* Keeps the light away from the text (05 §4: never behind small text). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-vault-black via-vault-black/90 to-transparent"
        />
        <div className="relative mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-end gap-4 px-4 pb-10 pt-16">
          <Logo />
          <h1 className="text-display font-semibold text-bone">Confianza en código.</h1>
          <p className="text-subtitle text-bone">La plata queda en bóveda hasta que el producto llega.</p>
          <Link
            href="/sell"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-ion-blue px-5 text-body font-medium text-bone hover:bg-ion-blue/90 sm:w-auto"
          >
            Creá tu link de pago
          </Link>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <h2 className="text-title font-semibold">Cómo funciona</h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-steel/20 bg-graphite p-4">
              <span className="font-mono text-label text-steel">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium text-bone">{step.title}</span>
                <span className="text-body text-steel">{step.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/orders" className="text-body text-ion-blue underline">
          Mis compras y ventas
        </Link>
      </section>
    </main>
  );
}
