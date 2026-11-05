"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Spectral backdrop for the landing hero (05 §4.1). The CSS fallback (diagonal
 * Spectral bands + grain PNG) renders immediately; the WebGPU version loads
 * lazily on top and fades in only if it starts. Never blocks the text.
 */
export function SpectralHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gpuReady, setGpuReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let teardown: (() => void) | undefined;
    let disposed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("@/lib/spectral-gpu")
      .then(({ startSpectral }) => startSpectral(canvas, { reducedMotion }))
      .then((stop) => {
        // Unmounted while starting (e.g. React strict mode): stop right away.
        if (disposed) return stop();
        teardown = stop;
        setGpuReady(true);
      })
      .catch(() => {
        // No WebGPU or init failed: the CSS fallback stays.
      });

    return () => {
      disposed = true;
      teardown?.();
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-vault-black">
      {/* Fallback: bands at ~115deg masked to a narrow strip, so >= 60% stays black. */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${gpuReady ? "opacity-0" : "opacity-100"}`}
        style={{
          backgroundImage: "var(--spectral)",
          maskImage: "linear-gradient(115deg, transparent 28%, black 46%, black 54%, transparent 72%)",
          WebkitMaskImage: "linear-gradient(115deg, transparent 28%, black 46%, black 54%, transparent 72%)",
          opacity: 0.9,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{ backgroundImage: "url(/grain.png)", backgroundRepeat: "repeat" }}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${gpuReady ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
