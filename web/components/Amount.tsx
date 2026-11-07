"use client";

import { formatArsApprox, formatUsdc, usdcToArs } from "@/lib/amounts";
import { useUsdcArsRate } from "@/lib/rate";

export interface AmountProps {
  units: bigint;
  /** `lg` for the one amount a screen is about. */
  size?: "md" | "lg";
  className?: string;
}

/** "USDC 120.50" in mono, and "≈ $ 145.300" below when there's a quote (03 §2). */
export function Amount({ units, size = "md", className = "" }: AmountProps) {
  const rate = useUsdcArsRate();
  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`font-mono tabular-nums text-bone ${size === "lg" ? "text-title tracking-tight sm:text-title-lg" : "text-body"}`}
      >
        {formatUsdc(units)}
      </span>
      {rate !== null ? (
        <span className="text-label tabular-nums text-steel">{formatArsApprox(usdcToArs(units, rate))}</span>
      ) : null}
    </span>
  );
}
