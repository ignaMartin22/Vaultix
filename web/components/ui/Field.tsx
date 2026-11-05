import { useId, type InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** 05 §8: graphite input, steel border at 40%, ion-blue focus. */
export function Field({ label, hint, error, id, className = "", ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-body font-medium text-bone">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-12 rounded-xl border bg-graphite px-4 text-body text-bone placeholder:text-steel focus:border-ion-blue focus:outline-none ${
          error ? "border-plasma" : "border-steel/40"
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-label text-plasma">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-label text-steel">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
