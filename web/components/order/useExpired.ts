"use client";

import { useEffect, useState } from "react";

import { deadlineState, nowSecs } from "@/lib/deadlines";

// setTimeout overflows past ~24.8 days; longer waits just re-arm.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Whether `at` (unix seconds) has passed, re-rendering the moment it does, so
 * an open order page shows the refund or release action without a reload.
 * Also re-renders once a minute so "faltan X min" keeps counting down.
 */
export function useExpired(at: bigint | undefined): boolean {
  const [, tick] = useState(0);
  const expired = at !== undefined && deadlineState(at, nowSecs()).expired;

  useEffect(() => {
    if (at === undefined || expired) return;
    const untilMs = Number(at - nowSecs() + 1n) * 1000;
    const timeout = setTimeout(() => tick((n) => n + 1), Math.min(untilMs, MAX_TIMEOUT_MS));
    const minute = setInterval(() => tick((n) => n + 1), 60_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(minute);
    };
  }, [at, expired]);

  return expired;
}
