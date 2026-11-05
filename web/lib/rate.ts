"use client";

/**
 * USDC→ARS reference quote from `/api/rate/usdc-ars` (B-11). If it fails or
 * the route isn't there yet, it's `null` and the UI hides the pesos line.
 */
import { useQuery } from "@tanstack/react-query";

export function useUsdcArsRate(): number | null {
  const { data } = useQuery({
    queryKey: ["rate", "usdc-ars"],
    queryFn: async () => {
      const res = await fetch("/api/rate/usdc-ars");
      if (!res.ok) return null;
      const body = (await res.json()) as { rate?: string | null };
      const rate = body.rate ? Number(body.rate) : NaN;
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? null;
}
