import type { ReactNode } from "react";

/**
 * What just happened and what comes next (05 §8, "Mensajes de estado"):
 * the fact first as a title, then what it means for the money and who acts.
 */
export function StateNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-steel/15 bg-graphite p-5 animate-[vault-fade_300ms_ease-out] sm:p-6">
      <h2 className="font-display text-title text-bone text-balance">{title}</h2>
      {children ? <div className="flex flex-col gap-2 text-body text-steel">{children}</div> : null}
    </section>
  );
}

/** A labelled block of facts inside the order column ("Mandalo a", "Seguimiento"). */
export function FactBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-steel/15 pt-4">
      <h3 className="font-mono text-label uppercase text-steel">{label}</h3>
      <div className="flex flex-col gap-1 text-body text-bone">{children}</div>
    </section>
  );
}
