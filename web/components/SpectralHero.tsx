"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Spectral backdrop for the landing hero (05 §4.1). The CSS fallback (diagonal
 * Spectral bands + grain PNG) renders immediately; the WebGPU version loads
 * lazily on top and fades in only if it starts. Never blocks the text.
 */
const BANDS = [
  "linear-gradient(118deg, transparent 40%, #000 47%, transparent 53%, #000 58%, transparent 63%, #000 67%, transparent 72%)",
  "linear-gradient(to left bottom, #000 10%, transparent 52%)",
].join(", ");

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
      {/*
        Fallback (05 §4): three soft parallel bands flowing diagonally, intersected
        with a fade anchored top-right, so the light never reaches the text block
        below and well over 60% of the frame stays Vault Black.
      */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${gpuReady ? "opacity-0" : "opacity-90"}`}
        style={{
          backgroundImage: "linear-gradient(105deg, var(--deep-teal) 38%, var(--ion-blue) 52%, var(--ultra-violet) 66%, var(--plasma) 82%, var(--ember) 96%)",
          maskImage: BANDS,
          WebkitMaskImage: BANDS,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
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
