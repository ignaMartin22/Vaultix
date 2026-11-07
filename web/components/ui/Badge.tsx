import type { HTMLAttributes } from "react";

export type BadgeTone = "steel" | "ion-blue" | "ultra-violet" | "plasma" | "released" | "ember";

// Full class names so Tailwind can see them.
const MARK: Record<BadgeTone, string> = {
  steel: "bg-steel",
  "ion-blue": "bg-ion-blue",
  "ultra-violet": "bg-ultra-violet",
  plasma: "bg-plasma",
  released: "bg-released",
  ember: "bg-ember",
};

const EDGE: Record<BadgeTone, string> = {
  steel: "border-steel/30",
  "ion-blue": "border-ion-blue/50",
  "ultra-violet": "border-ultra-violet/50",
  plasma: "border-plasma/50",
  released: "border-released/40",
  ember: "border-ember/50",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/**
 * Mono, uppercase, over graphite ("EN BÓVEDA"). The state's color goes on the
 * mark and the edge; the label stays Bone so it reads at 12 px (Ion Blue and
 * Ultra Violet text on graphite fall under 4.5:1). Color never stands alone.
 */
export function Badge({ tone = "steel", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border bg-graphite py-1 pl-2 pr-2.5 font-mono text-label uppercase text-bone ${EDGE[tone]} ${className}`}
      {...props}
    >
      <span aria-hidden="true" className={`size-1.5 rotate-45 ${MARK[tone]}`} />
      {children}
    </span>
  );
}
