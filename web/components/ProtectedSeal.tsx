import { LogoIsotype } from "@/components/Logo";

export interface ProtectedSealProps {
  /** Mono line under "Pago protegido". Say only what's true for this link right now. */
  line?: string;
  className?: string;
}

/**
 * The "Pago protegido" seal that goes with every link (05 §7): isotype +
 * "Pago protegido" + a mono line. The padding keeps the isotype's ½x clear space.
 */
export function ProtectedSeal({ line = "FONDOS EN BÓVEDA", className = "" }: ProtectedSealProps) {
  return (
    <div
      className={`inline-flex items-center gap-4 rounded-2xl border border-steel/20 bg-graphite py-3 pl-3 pr-5 ${className}`}
    >
      <LogoIsotype size={32} className="text-bone" />
      <div className="flex flex-col">
        <span className="text-body font-medium leading-tight text-bone">Pago protegido</span>
        <span className="font-mono text-label uppercase text-steel">{line}</span>
      </div>
    </div>
  );
}
