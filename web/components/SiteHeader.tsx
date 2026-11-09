"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo, LogoIsotype } from "@/components/Logo";

// `short` fits three links on a 320–375 px phone; from sm the full label shows.
const NAV = [
  { href: "/sell", label: "Vender", short: "Vender" },
  { href: "/orders", label: "Mis operaciones", short: "Operaciones" },
  { href: "/account", label: "Tu cuenta", short: "Cuenta" },
] as const;

const LIGHT = "bg-[linear-gradient(90deg,var(--ion-blue),var(--ultra-violet),var(--plasma))]";

/**
 * Logo home, and the two places people go back to. Colored discretion: the
 * spectral light shows only as a thin line, rising from the center on hover
 * and staying lit under the page you're on, with a small spectral mark.
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-steel/10">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
        <Link
          href="/"
          aria-label="Vaultix, inicio"
          className="-m-2 rounded-lg p-2 opacity-90 transition-opacity duration-200 hover:opacity-100"
        >
          {/* Phones: the isotype alone (05 §2: isotype for small spaces), so three links fit. */}
          <span className="flex text-bone sm:hidden">
            <LogoIsotype size={32} />
          </span>
          <span className="hidden sm:flex">
            <Logo fontSize={28} />
          </span>
        </Link>
        <nav aria-label="Principal">
          <ul className="flex items-center gap-0 sm:gap-2">
            {NAV.map(({ href, label, short }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-11 items-center gap-2 rounded-lg px-1.5 text-body transition-colors duration-200 sm:px-3 ${
                      active ? "text-bone" : "text-steel hover:bg-graphite/70 hover:text-bone"
                    }`}
                  >
                    {/* The page you're on carries a small spectral mark, like the state badges. */}
                    {active ? (
                      <span
                        aria-hidden="true"
                        className={`hidden size-1.5 rotate-45 animate-[vault-fade_300ms_ease-out] sm:block ${LIGHT}`}
                      />
                    ) : null}
                    <span className="relative">
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{label}</span>
                      {/* Light right under the word: grows from the center on hover, stays lit when active. */}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-x-0 -bottom-1 h-0.5 origin-center rounded-full transition-[opacity,scale] duration-300 ease-vault ${LIGHT} ${
                          active
                            ? "scale-x-100 opacity-100"
                            : "scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70 group-focus-visible:scale-x-100 group-focus-visible:opacity-70"
                        }`}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
