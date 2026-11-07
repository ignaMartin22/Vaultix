"use client";

import { formatArsApprox, usdcToArs } from "@/lib/amounts";
import { useUsdcArsRate } from "@/lib/rate";

/** "≈ $ 145.300" at today's quote; nothing until there is one (never a guessed rate). */
export function ArsApprox({ units }: { units: bigint }) {
  const rate = useUsdcArsRate();
  return rate === null ? null : <>{formatArsApprox(usdcToArs(units, rate))}</>;
}
