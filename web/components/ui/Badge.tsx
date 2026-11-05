import type { HTMLAttributes } from "react";

export type BadgeTone = "steel" | "ion-blue" | "ultra-violet" | "plasma" | "released" | "ember";

// Full class names so Tailwind can see them.
const TONES: Record<BadgeTone, string> = {
  steel: "text-steel",
  "ion-blue": "text-ion-blue",
  "ultra-violet": "text-ultra-violet",
  plasma: "text-plasma",
  released: "text-released",
  ember: "text-ember",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Mono, uppercase, tone color over graphite ("ESTADO: ENVIADO"). */
export function Badge({ tone = "steel", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-graphite px-2 py-1 font-mono text-label uppercase ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}
