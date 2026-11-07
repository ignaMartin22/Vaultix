import { Logo } from "@/components/Logo";

/** The brand's signature, nothing to click: the same logo as the header. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-steel/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo fontSize={28} />
        <p className="text-body text-steel">Confianza en código. La plata queda en bóveda hasta que el producto llega.</p>
      </div>
    </footer>
  );
}
