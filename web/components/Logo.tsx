/**
 * Horizontal logo: isotype + "vaultix" wordmark (05 §2).
 *
 * TODO(brand): the master isotype SVG is not in the repo yet. Drop it into
 * `LogoIsotype` once the brand team delivers it. Do NOT redraw it from the
 * construction table in 05 §2 without validation.
 */
export function LogoIsotype(): null {
  return null;
}

export interface LogoProps {
  className?: string;
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-bone ${className}`}>
      <LogoIsotype />
      {/* Inter SemiBold, lowercase, tracking −4.5%. */}
      <span className="text-title font-semibold lowercase tracking-[-0.045em]">vaultix</span>
    </span>
  );
}
