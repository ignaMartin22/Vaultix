import type { ReactNode } from "react";

/** A turning ring (the vault door's dial) with the reason we're waiting. */
export function Loading({ label = "Cargando…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center gap-3 text-body text-steel ${className}`}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`size-5 shrink-0 animate-[spin_1.2s_linear_infinite] ${className}`}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Something went wrong loading or saving: an alert (ember), never the dispute color. */
export function ErrorNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-3 text-body text-bone ${className}`}>
      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rotate-45 bg-ember" />
      <span>{children}</span>
    </p>
  );
}

/** A page-level heading block: mono eyebrow, display title, optional lede. */
export function PageIntro({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-3 ${className}`}>
      {eyebrow ? <span className="font-mono text-label uppercase text-steel">{eyebrow}</span> : null}
      <h1 className="font-display text-display text-bone text-balance lg:text-display-lg">{title}</h1>
      {children ? <div className="max-w-xl text-subtitle text-steel text-pretty">{children}</div> : null}
    </header>
  );
}
