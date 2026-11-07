"use client";

import { useId } from "react";

import { ISOTYPE, LOGO_RATIO } from "@/lib/isotype";

export interface LogoIsotypeProps {
  /** Rendered height in px. */
  size?: number;
  /**
   * The reduced version without the ring (05 §2 suggests it under 32 px).
   * Opt-in: by the owner's decision the full isotype is used everywhere,
   * favicon included, so the mark is always the same one.
   */
  reduced?: boolean;
  className?: string;
  /** Accessible name; leave empty when a visible "vaultix" sits next to it. */
  title?: string;
}

/**
 * The vault door seen from the front (05 §2), always in one color
 * (`currentColor`): Bone on Vault Black, Bone on Ion Blue, Vault Black on Bone.
 */
export function LogoIsotype({ size = 32, reduced = false, className = "", title }: LogoIsotypeProps) {
  // url(#…) breaks on some characters React ids may carry: keep it CSS-safe.
  const maskId = `vx${useId().replace(/[^\w-]/g, "")}`;
  const { disc, ring, v } = ISOTYPE;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <rect width="100" height="100" fill="#fff" />
        {reduced ? null : (
          <circle cx={disc.cx} cy={disc.cy} r={ring.r} fill="none" stroke="#000" strokeWidth={ring.stroke} />
        )}
        <path d={v.path} fill="none" stroke="#000" strokeWidth={v.stroke} strokeLinejoin="miter" strokeMiterlimit={10} />
      </mask>
      <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export interface LogoProps {
  /** Wordmark font size in px. Keep it ≥ 21 so the logo stays ≥ 24 px tall (05 §2). */
  fontSize?: number;
  className?: string;
}

/**
 * Horizontal logo, the default for web (05 §2): isotype + "vaultix" in
 * Inter Display SemiBold, lowercase, tracking −4.5%. Proportions from the
 * manual's master; keep ½x of clear space around it where it's placed.
 */
export function Logo({ fontSize = 24, className = "" }: LogoProps) {
  const isotype = Math.round(fontSize * LOGO_RATIO.isotypeEm);
  return (
    <span
      className={`inline-flex items-center text-bone ${className}`}
      style={{ fontSize, gap: `${LOGO_RATIO.gapEm}em` }}
    >
      {/* Optical alignment: the master centers the isotype on the x-height, not the line box. */}
      <LogoIsotype size={isotype} className="translate-y-[0.04em]" />
      <span className="font-display leading-none lowercase tracking-[-0.045em]">vaultix</span>
    </span>
  );
}
