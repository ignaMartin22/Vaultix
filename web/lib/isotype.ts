/**
 * Isotype geometry (05 §2), on the brand's 100-unit grid.
 *
 * Validated against the master isotype embedded in Vaultix_Manual_de_Marca.pdf
 * (page 6: a Bone disc cut by a 469 px alpha mask). Rasterized at that size,
 * this geometry matches the master on 99.4% of the non-antialiased pixels;
 * the rest sit on the cut edges (≤ 0.3u). Swap it for the master SVG file
 * once the brand team delivers one.
 */
const RAD = (58 * Math.PI) / 180;
const ARM = 90;

export const ISOTYPE = {
  disc: { cx: 50, cy: 50, r: 46 },
  ring: { r: 34, stroke: 3.2 },
  v: {
    stroke: 8.5,
    /** Vertex at (50, 70); each arm at 58° from the horizontal, leaving the disc at the top. */
    path: `M${(50 - Math.cos(RAD) * ARM).toFixed(2)} ${(70 - Math.sin(RAD) * ARM).toFixed(2)}L50 70L${(50 + Math.cos(RAD) * ARM).toFixed(2)} ${(70 - Math.sin(RAD) * ARM).toFixed(2)}`,
  },
} as const;

/**
 * Horizontal logo proportions, measured on the manual's master (page 6):
 * the isotype is 1.163× the wordmark's font size, 0.374 em away from it.
 */
export const LOGO_RATIO = { isotypeEm: 1.163, gapEm: 0.374 } as const;

/** Standalone SVG markup, for places without React DOM (favicon, Open Graph). */
export function isotypeSvg(color: string, { reduced = false, id = "vx" } = {}): string {
  const { disc, ring, v } = ISOTYPE;
  const ringCut = reduced
    ? ""
    : `<circle cx="${disc.cx}" cy="${disc.cy}" r="${ring.r}" fill="none" stroke="#000" stroke-width="${ring.stroke}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect width="100" height="100" fill="#fff"/>${ringCut}` +
    `<path d="${v.path}" fill="none" stroke="#000" stroke-width="${v.stroke}" stroke-linejoin="miter" stroke-miterlimit="10"/>` +
    `</mask>` +
    `<circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}" fill="${color}" mask="url(#${id})"/>` +
    `</svg>`
  );
}
