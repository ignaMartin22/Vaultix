/**
 * Brand colors as plain hex, for places that can't read CSS variables (the
 * Open Graph image renderer). Mirrors styles/tokens.css; a test keeps them equal.
 */
export const BRAND = {
  vaultBlack: "#08090B",
  graphite: "#16191F",
  steel: "#8B93A1",
  bone: "#F2F1EC",
  ionBlue: "#2F5BFF",
  ultraViolet: "#8B3DFF",
} as const;

/** CSS variable name for each entry, as in tokens.css. */
export const BRAND_VARS: Record<keyof typeof BRAND, string> = {
  vaultBlack: "--vault-black",
  graphite: "--graphite",
  steel: "--steel",
  bone: "--bone",
  ionBlue: "--ion-blue",
  ultraViolet: "--ultra-violet",
};
