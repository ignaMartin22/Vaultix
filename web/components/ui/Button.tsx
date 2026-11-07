import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  // The hero's beam as the action color. At rest it shows blue → violet; while the
  // pointer is over it the light flows back and forth through plasma, and it
  // freezes where it is on leave (no snap back). To go back to flat Ion Blue, restore:
  // "bg-ion-blue text-bone hover:bg-[color-mix(in_srgb,var(--ion-blue)_88%,var(--bone))] active:bg-ion-blue/90"
  primary:
    "bg-[linear-gradient(100deg,var(--ion-blue)_0%,var(--ultra-violet)_30%,var(--plasma)_50%,var(--ultra-violet)_70%,var(--ion-blue)_100%)] bg-size-[300%_100%] bg-left text-bone animate-[vault-beam_3.2s_ease-in-out_infinite_alternate] [animation-play-state:paused] hover:[animation-play-state:running] active:brightness-95",
  secondary: "border border-steel/50 bg-transparent text-bone hover:border-steel hover:bg-graphite",
  destructive: "border border-plasma/70 bg-transparent text-plasma hover:border-plasma hover:bg-plasma/10",
  ghost: "bg-transparent text-steel hover:bg-graphite hover:text-bone",
};

/** 05 §8: 48 px tall, radius 12 px, 16/500, full width on mobile. */
export function buttonClass(variant: ButtonVariant = "primary", className = "", fullWidth = false): string {
  return `inline-flex h-12 ${fullWidth ? "w-full" : "w-full sm:w-auto"} select-none items-center justify-center gap-2 rounded-xl px-5 text-body font-medium transition-[background-color,background-position,border-color,color,transform] duration-300 ease-vault active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${className}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Full width at every size (inside narrow columns). */
  fullWidth?: boolean;
}

export function Button({ variant = "primary", fullWidth, className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className, fullWidth)} {...props} />;
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  /** Full width at every size (inside narrow columns). */
  fullWidth?: boolean;
}

/** An in-app navigation that looks like a button. */
export function ButtonLink({ variant = "primary", fullWidth, className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, className, fullWidth)} {...props} />;
}

export interface ButtonAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  /** Full width at every size (inside narrow columns). */
  fullWidth?: boolean;
}

/** An external link that looks like a button (e.g. "Compartí por WhatsApp"). */
export function ButtonAnchor({ variant = "primary", fullWidth, className = "", ...props }: ButtonAnchorProps) {
  return <a className={buttonClass(variant, className, fullWidth)} {...props} />;
}
