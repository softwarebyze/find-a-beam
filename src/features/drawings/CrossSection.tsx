/**
 * Cross-section drawing contract. (Stub — the full implementation is in progress.)
 *  - mode "dimensioned": to-scale drawing with dimension lines (d, bf, tw, tf, k …) and axes.
 *  - mode "thumbnail": small silhouette for lists.
 *  - `scale` (px per inch) lets callers draw several shapes at a common scale (compare view).
 */
import type { Shape } from "@/data/shapes";

export interface CrossSectionProps {
  shape: Shape;
  mode?: "dimensioned" | "thumbnail";
  /** Pixels per inch; omit to fit the container */
  scale?: number;
  className?: string;
  showAxes?: boolean;
}

export function CrossSection({ shape, className }: CrossSectionProps) {
  return (
    <div className={className}>
      <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line text-xs text-faint">{shape.label}</div>
    </div>
  );
}
