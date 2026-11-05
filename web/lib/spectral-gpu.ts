/**
 * WebGPU side of the Spectral hero (05 §4.1), loaded lazily by SpectralHero.
 * Throws if WebGPU is unavailable so the caller keeps the CSS fallback.
 */
import { clock, effect, frame, frameLoop, init, surface } from "vgpu";

import spectralShader from "@/components/spectral.wgsl";

import { BRAND, hexToVec4, SPECTRAL } from "./brand";

/** Starts the effect on `canvas`; resolves to a teardown function. */
export async function startSpectral(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): Promise<() => void> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) throw new Error("WebGPU unavailable");

  const gpu = await init();
  const target = surface(gpu, canvas, { dpr: [1, 2] });
  const [c0, c1, c2, c3, c4] = SPECTRAL.map(hexToVec4);
  const fx = effect(gpu, spectralShader, {
    set: {
      params: {
        resolution: [target.size[0], target.size[1]],
        time: 0,
        motion: opts.reducedMotion ? 0 : 1,
        base: hexToVec4(BRAND.vaultBlack),
        c0,
        c1,
        c2,
        c3,
        c4,
      },
    },
  });

  if (opts.reducedMotion) {
    // prefers-reduced-motion: one still frame, no loop.
    frame(gpu, (f) => f.pass(target, fx));
    return () => {
      fx.dispose();
      gpu.dispose();
    };
  }

  const time = clock(gpu);
  const loop = frameLoop(gpu, (f) => {
    fx.set({ params: { time: time.time, resolution: [target.size[0], target.size[1]] } });
    f.pass(target, fx);
  });
  return () => {
    loop.stop();
    fx.dispose();
    gpu.dispose();
  };
}
