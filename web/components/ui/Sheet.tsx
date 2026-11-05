"use client";

import { useEffect, useId, type ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Mobile modal from the bottom: graphite, 20 px top radius (05 §8). */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-vault-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-t-[20px] bg-graphite p-4 pb-8"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-steel/40" aria-hidden="true" />
        <h2 id={titleId} className="mb-4 text-title font-semibold text-bone">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
