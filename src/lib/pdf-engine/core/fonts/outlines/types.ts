/**
 * Vector path types for glyph outlines (M6).
 *
 * Coordinates are in font glyph space (typically 1000 units per em, y-up).
 */

export type PathSegment =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "Q"; x1: number; y1: number; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

export interface GlyphOutline {
  segments: PathSegment[];
}

/** Axis-aligned bounds of path segments. Returns undefined for empty paths. */
export function outlineBBox(segments: PathSegment[]): [number, number, number, number] | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const s of segments) {
    switch (s.op) {
      case "M":
      case "L":
        add(s.x, s.y);
        break;
      case "Q":
        add(s.x1, s.y1);
        add(s.x, s.y);
        break;
      case "C":
        add(s.x1, s.y1);
        add(s.x2, s.y2);
        add(s.x, s.y);
        break;
      case "Z":
        break;
    }
  }
  if (!Number.isFinite(x0)) return undefined;
  return [x0, y0, x1, y1];
}
