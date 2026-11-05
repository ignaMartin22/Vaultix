"use client";

import { formatArsApprox, formatUsdc, usdcToArs } from "@/lib/amounts";
import { useUsdcArsRate } from "@/lib/rate";

export interface AmountProps {
  units: bigint;
  className?: string;
}

/** "USDC 120.50" in mono, and "≈ $ 145.300" below when there's a quote (03 §2). */
export function Amount({ units, className = "" }: AmountProps) {
  const rate = useUsdcArsRate();
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className="font-mono text-bone">{formatUsdc(units)}</span>
      {rate !== null ? (
        <span className="text-label text-steel">{formatArsApprox(usdcToArs(units, rate))}</span>
      ) : null}
    </span>
  );
}
