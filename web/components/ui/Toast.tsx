"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Errors are alerts (05 §3: ember). Plasma stays reserved for disputes.
const MARK: Record<ToastTone, string> = {
  info: "bg-steel",
  success: "bg-released",
  error: "bg-ember",
};

const DURATION_MS = 4_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, DURATION_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="flex w-full max-w-sm items-start gap-3 rounded-xl border border-steel/25 bg-graphite px-4 py-3 text-body text-bone animate-[vault-rise_240ms_var(--ease-vault)]"
          >
            <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rotate-45 ${MARK[item.tone]}`} />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
