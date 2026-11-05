import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ion-blue text-bone hover:bg-ion-blue/90",
  secondary: "border border-steel bg-transparent text-bone hover:bg-graphite",
  destructive: "border border-plasma bg-transparent text-plasma hover:bg-plasma/10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** 05 §8: 48 px tall, radius 12 px, 16/500, full width on mobile. */
export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
