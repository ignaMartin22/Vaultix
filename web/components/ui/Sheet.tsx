"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Mobile: a sheet from the bottom, graphite, 20 px top radius (05 §8).
 * From `sm` up it settles as a centered dialog. Focus moves in on open,
 * returns on close, and the page behind doesn't scroll.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Callers pass inline closures: read the latest one without re-running the
  // effect (that would steal focus from the fields on every keystroke).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the dialog.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-vault-black/80 animate-[vault-fade_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-[20px] border-t border-steel/20 bg-graphite px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 outline-none animate-[vault-rise_280ms_var(--ease-vault)] sm:rounded-[20px] sm:border sm:p-8"
      >
        <div className="mx-auto mb-5 h-1 w-10 shrink-0 rounded-full bg-steel/40 sm:hidden" aria-hidden="true" />
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-title text-bone">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 hidden size-11 shrink-0 items-center justify-center rounded-full text-steel transition-colors hover:bg-vault-black hover:text-bone sm:flex"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
