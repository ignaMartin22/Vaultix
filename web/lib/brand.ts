/**
 * Brand colors as plain hex, for places that can't read CSS variables (the
 * Open Graph renderer, WebGPU uniforms). Mirrors styles/tokens.css; a test
 * keeps them equal.
 */
export const BRAND = {
  vaultBlack: "#08090B",
  graphite: "#16191F",
  steel: "#8B93A1",
  bone: "#F2F1EC",
  deepTeal: "#0F3A3C",
  ionBlue: "#2F5BFF",
  ultraViolet: "#8B3DFF",
  plasma: "#FF3E8A",
  ember: "#FF6A1A",
} as const;

/** CSS variable name for each entry, as in tokens.css. */
export const BRAND_VARS: Record<keyof typeof BRAND, string> = {
  vaultBlack: "--vault-black",
  graphite: "--graphite",
  steel: "--steel",
  bone: "--bone",
  deepTeal: "--deep-teal",
  ionBlue: "--ion-blue",
  ultraViolet: "--ultra-violet",
  plasma: "--plasma",
  ember: "--ember",
};

/** The Spectral stops (05 §4), in order: 0%, 28%, 52%, 76%, 100%. */
export const SPECTRAL = [BRAND.deepTeal, BRAND.ionBlue, BRAND.ultraViolet, BRAND.plasma, BRAND.ember] as const;

/** "#RRGGBB" → [r, g, b, 1] in 0..1, for shader uniforms. */
export function hexToVec4(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
