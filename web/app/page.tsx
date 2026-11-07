import { ChatExample } from "@/components/ChatExample";
import { LogoIsotype } from "@/components/Logo";
import { RulesFacts } from "@/components/RulesFacts";
import { SpectralHero } from "@/components/SpectralHero";
import { OrderTrack } from "@/components/order/OrderTrack";
import { ProtectedSeal } from "@/components/ProtectedSeal";
import { StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { formatUsdc } from "@/lib/amounts";
import type { OrderStatus } from "@/lib/vaultix/contract";

type Holder = "buyer" | "vault" | "seller";

/**
 * Where the money is at each step (05 §1). Statuses are the contract's own.
 * `step` is the visible number; "04b" is the detour (a claim), not a step everyone goes through.
 */
const FLOW: {
  step: string;
  text: string;
  detail: string;
  holder: Holder;
  status?: OrderStatus;
  detour?: boolean;
}[] = [
  {
    step: "01",
    text: "El vendedor crea el link y te lo pasa.",
    detail: "Fotos, título y precio. Nada más.",
    holder: "buyer",
    status: "Created",
  },
  {
    step: "02",
    text: "Pagás. La plata entra a la bóveda, no al vendedor.",
    detail: "Nadie la puede tocar: ni el vendedor, ni vos, ni nosotros.",
    holder: "vault",
    status: "Paid",
  },
  {
    step: "03",
    text: "El vendedor despacha dentro del plazo.",
    detail: "Si no despacha a tiempo, te devolvemos todo.",
    holder: "vault",
    status: "Shipped",
  },
  {
    step: "04",
    text: "Te llega y confirmás.",
    detail: "Si no confirmás ni reclamás dentro del plazo, se libera solo.",
    holder: "vault",
  },
  {
    step: "04b",
    text: "Si algo está mal: reclamo.",
    detail:
      "Las dos partes suben pruebas y decide el equipo de Vaultix. Mientras tanto, la plata sigue en bóveda.",
    holder: "vault",
    status: "Disputed",
    detour: true,
  },
  {
    step: "05",
    text: "Se libera: el vendedor cobra.",
    detail: "La comisión se cobra solo en este paso.",
    holder: "seller",
    status: "Released",
  },
];

const HOLDERS: { key: Holder; label: string; sr: string }[] = [
  { key: "buyer", label: "Comprador", sr: "La plata la tiene el comprador." },
  { key: "vault", label: "Bóveda", sr: "La plata está en bóveda." },
  { key: "seller", label: "Vendedor", sr: "La plata la tiene el vendedor." },
];

const RULES = {
  buyer: [
    "Pagás y la plata queda en bóveda. Al vendedor no le llega todavía.",
    "Si no lo despacha a tiempo, te devolvemos todo.",
    "Cuando te llega, confirmás. Si algo está mal, reclamás antes del plazo. Si no hacés ninguna de las dos, se libera solo.",
  ],
  seller: [
    "Creás el link en un minuto y lo compartís donde ya vendés.",
    "Cuando te pagan, despachás dentro del plazo.",
    "Cobrás cuando el comprador confirma que le llegó. Si no confirma ni reclama, cobrás igual al vencer el plazo de reclamo.",
  ],
};

/** Landing (03 §5.1): the Spectral cover, where the money is, the shared rules, the CTA. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Cover: the only screen where the Spectral light shows (05 §4). */}
      <section className="relative isolate overflow-hidden">
        <SpectralHero />
        {/* Keeps the light away from the text (05 §4: never behind small text). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-vault-black via-vault-black/90 to-transparent"
        />
        {/* Mobile: the CTA must land in the first screen of a small phone, so less air on top. */}
        <div className="relative mx-auto grid min-h-[min(70svh,620px)] w-full max-w-6xl items-end gap-12 px-4 pb-12 pt-24 sm:min-h-[min(82svh,760px)] sm:px-6 sm:pb-20 sm:pt-40 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div className="flex flex-col gap-7 sm:gap-8">
            {/* The promise first; "Confianza en código" signs the footer. */}
            <h1 className="max-w-4xl font-display text-hero text-bone text-balance">
              Tu plata queda en bóveda hasta que te llega.
            </h1>
            <div className="flex max-w-2xl flex-col gap-8">
              <p className="text-subtitle text-bone text-pretty sm:text-xl sm:leading-8">
                Un link de pago para comprar y vender por Instagram, Marketplace o WhatsApp con
                alguien que no conocés. Nadie toca la plata hasta que se cumple el trato.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ButtonLink href="/sell">Creá tu link de pago</ButtonLink>
                <ButtonLink href="/orders" variant="ghost">
                  Mis operaciones
                </ButtonLink>
              </div>
            </div>
          </div>
          {/* The product itself in the first screen; the light passes behind it. Desktop only: mobile meets it in the chat. */}
          <VaultTicket />
        </div>
      </section>

      {/* Where the money is: the vault is the column in the middle. */}
      <section
        aria-labelledby="flow-title"
        className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="flex flex-col gap-4 lg:sticky lg:top-12 lg:self-start">
            <h2
              id="flow-title"
              className="font-display text-display text-bone text-balance lg:text-display-lg"
            >
              Siempre sabés dónde está la plata.
            </h2>
            <p className="max-w-md text-subtitle text-steel text-pretty">
              Desde que pagás hasta que llega, la plata no la tiene ninguna de las dos partes. La
              guarda la bóveda.
            </p>
          </div>

          <div className="relative">
            {/* The vault: a graphite slab behind the middle column, top to bottom (sm+). */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-24 hidden w-24 rounded-2xl border border-steel/15 bg-graphite sm:block"
            />
            <div
              aria-hidden="true"
              className="relative hidden border-b border-steel/15 pb-4 pt-5 font-mono text-label uppercase text-steel sm:grid sm:grid-cols-[1fr_6rem_6rem_6rem]"
            >
              <span />
              {HOLDERS.map((h) => (
                <span key={h.key} className={`text-center ${h.key === "vault" ? "text-bone" : ""}`}>
                  {h.label}
                </span>
              ))}
            </div>
            <ol className="relative">
              {FLOW.map((step) => (
                <li
                  key={step.text}
                  className="grid grid-cols-3 items-center gap-y-4 border-b border-steel/15 py-6 last:border-b-0 sm:grid-cols-[1fr_6rem_6rem_6rem]"
                >
                  <div className="col-span-3 flex flex-col gap-2 sm:col-span-1 sm:pr-6">
                    <span className="font-mono text-label text-steel">
                      {step.step}
                      {step.detour ? <span className="ml-2">· Si hay un problema</span> : null}
                    </span>
                    <span className="text-body font-medium text-bone text-pretty">{step.text}</span>
                    <span className="text-body text-steel text-pretty">{step.detail}</span>
                    {step.status ? (
                      <StatusBadge status={step.status} className="self-start" />
                    ) : null}
                    {/* Mobile: the holder named on every step, no column headers to remember. */}
                    <span className="mt-2 flex items-center gap-2 sm:hidden">
                      <span className="rounded-md bg-bone px-1.5 py-1 font-mono text-label text-vault-black">
                        <span aria-hidden="true">$$$</span>
                        <span className="sr-only">La plata</span>
                      </span>
                      <span className="text-label text-steel">en</span>
                      <span
                        className={`rounded-md px-2 py-1 font-mono text-label uppercase ${
                          step.holder === "vault"
                            ? "border border-bone/60 text-bone"
                            : "border border-steel/30 text-steel"
                        }`}
                      >
                        {HOLDERS.find((h) => h.key === step.holder)!.label}
                      </span>
                    </span>
                  </div>
                  {HOLDERS.map((h) => (
                    <div key={h.key} className="hidden h-10 items-center justify-center sm:flex">
                      {step.holder === h.key ? (
                        <span className="inline-flex items-center rounded-md bg-bone px-1.5 py-1 font-mono text-label text-vault-black">
                          <span aria-hidden="true">$$$</span>
                          <span className="sr-only">{h.sr}</span>
                        </span>
                      ) : (
                        <span aria-hidden="true" className="size-1 rounded-full bg-steel/30" />
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Neutral by construction: the same rules, side by side, the same weight. */}
      <section aria-labelledby="rules-title" className="border-y border-steel/10 bg-graphite/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-col gap-4">
            <h2
              id="rules-title"
              className="max-w-2xl font-display text-display text-bone text-balance lg:text-display-lg"
            >
              Las mismas reglas para los dos.
            </h2>
          </div>
          <div className="mt-12 grid gap-10 md:grid-cols-[1fr_auto_1fr] md:gap-12">
            <RuleColumn title="Si comprás" lines={RULES.buyer} />
            <div
              aria-hidden="true"
              className="hidden flex-col items-center gap-4 text-steel/40 md:flex"
            >
              <span className="w-px flex-1 bg-steel/20" />
              <LogoIsotype size={40} />
              <span className="w-px flex-1 bg-steel/20" />
            </div>
            <RuleColumn title="Si vendés" lines={RULES.seller} />
          </div>
          {/* No fine print: the numbers come from the vault's config, at reading size. */}
          <div className="mt-16 flex flex-col gap-6">
            <h3 className="font-display text-title text-bone">Los números, a la vista</h3>
            <RulesFacts />
            <div className="flex max-w-2xl flex-col gap-3 text-body text-bone text-pretty">
              <p>
                Se paga en USDC, dólares digitales: 1 USDC vale cerca de 1 dólar. Si no tenés, los
                cargás desde apps como Lemon o Ripio.
              </p>
              <p>
                Si hay un problema, el comprador abre un reclamo, las dos partes suben pruebas y
                decide el equipo de Vaultix. Solo puede repartir la plata entre comprador y
                vendedor; Vaultix se queda únicamente con la comisión.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The link is how Vaultix travels (05 §9): shown where it travels, a chat. */}
      <section
        aria-labelledby="share-title"
        className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
      >
        {/* Mobile: heading, the chat, then the CTA last (thumb zone). Desktop: chat left, text right. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-8">
          <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:self-end">
            <h2
              id="share-title"
              className="font-display text-display text-bone text-balance lg:text-display-lg"
            >
              Vendé donde ya vendés.
            </h2>
            <p className="max-w-md text-subtitle text-steel text-pretty">
              Mandás el link por el mismo chat de siempre. Tu comprador ve el sello antes de pagar y
              vos cobrás cuando le llega.
            </p>
          </div>
          <ChatExample className="w-full lg:col-start-1 lg:row-span-2 lg:row-start-1" />
          <ButtonLink
            href="/sell"
            className="lg:col-start-2 lg:row-start-2 lg:self-start lg:justify-self-start"
          >
            Creá tu link de pago
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}

function RuleColumn({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-6">
      <h3 className="font-display text-title text-bone">{title}</h3>
      <ol className="flex flex-col">
        {lines.map((line, i) => (
          <li key={line} className="flex gap-4 border-t border-steel/15 py-4">
            <span className="font-mono text-label leading-6 text-steel">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-body text-bone text-pretty">{line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * An order in "En bóveda", as the manual's order screen shows it (05 §9):
 * reference, status, product, amount, the headline and the track. An example,
 * and labelled as one.
 */
function VaultTicket() {
  return (
    <article
      aria-label="Ejemplo de un pedido en bóveda"
      className="hidden flex-col gap-5 rounded-3xl border border-steel/20 bg-graphite p-6 lg:flex"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-label text-steel">Pedido 7Kq2…x9Fp</span>
        <StatusBadge status="Paid" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-body text-bone">Campera de cuero · Talle M</span>
        <span className="font-mono text-title tabular-nums text-bone">
          {formatUsdc(120_000_000n)}
        </span>
      </div>
      <div className="flex flex-col gap-2 border-t border-steel/15 pt-5">
        <span className="font-display text-title text-bone">Tu plata está en bóveda.</span>
        <span className="text-body text-steel">
          Se libera cuando confirmes que llegó, o sola al vencer el plazo de reclamo.
        </span>
      </div>
      <OrderTrack status="Paid" />
      <ProtectedSeal line="Fondos en bóveda" className="self-start" />
      <span className="border-t border-steel/15 pt-4 font-mono text-label uppercase text-steel">
        Ejemplo
      </span>
    </article>
  );
}
