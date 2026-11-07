import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** 05 §8: graphite input, steel border at 40%, ion-blue focus. Shared by every control. */
export const controlClass =
  "w-full rounded-xl border px-4 text-body text-bone transition-colors placeholder:text-steel/80 hover:border-steel/70 focus:border-ion-blue focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-ion-blue";

const edge = (error?: string) => (error ? "border-ember" : "border-steel/40");
/** Graphite on the page; Vault Black when the control sits on a graphite panel or sheet. */
const fill = (onSurface?: boolean) => (onSurface ? "bg-vault-black" : "bg-graphite");

interface FrameProps {
  id: string;
  label: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label always visible above; one line of help or error below (05 §7.3). */
function Frame({ id, label, hint, error, children }: FrameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-medium text-bone">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-label text-ember">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-label text-steel">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function described(id: string, hint?: string, error?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  onSurface?: boolean;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, onSurface, id, className = "", ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Frame id={inputId} label={label} hint={hint} error={error}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(inputId, hint, error)}
        className={`h-12 ${controlClass} ${fill(onSurface)} ${edge(error)} ${className}`}
        {...props}
      />
    </Frame>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  onSurface?: boolean;
  hint?: string;
  error?: string;
}

export function TextAreaField({ label, hint, error, onSurface, id, className = "", ...props }: TextAreaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Frame id={inputId} label={label} hint={hint} error={error}>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(inputId, hint, error)}
        className={`min-h-28 resize-y py-3 ${controlClass} ${fill(onSurface)} ${edge(error)} ${className}`}
        {...props}
      />
    </Frame>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  onSurface?: boolean;
  hint?: string;
}

export function SelectField({ label, hint, onSurface, id, className = "", children, ...props }: SelectFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Frame id={inputId} label={label} hint={hint}>
      <div className="relative">
        <select
          id={inputId}
          aria-describedby={described(inputId, hint)}
          className={`h-12 appearance-none pr-10 ${controlClass} ${fill(onSurface)} ${edge()} ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-4 top-1/2 size-3 -translate-y-1/2 text-steel"
        >
          <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </Frame>
  );
}
