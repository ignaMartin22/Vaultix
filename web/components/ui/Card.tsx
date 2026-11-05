import type { HTMLAttributes } from "react";

/** 05 §8: graphite, 1 px steel border at 20%, radius 16 px, padding 16 px. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-steel/20 bg-graphite p-4 ${className}`}
      {...props}
    />
  );
}
