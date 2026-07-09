/**
 * Path transforms for glyph outlines (M6).
 */
import type { Matrix } from "../../content/matrix";
import { apply } from "../../content/matrix";
import type { GlyphOutline, PathSegment } from "./types";

/** Apply a 2×3 PDF matrix to every point in a glyph outline. */
export function transformOutline(outline: GlyphOutline, m: Matrix): GlyphOutline {
  const tf = (x: number, y: number) => apply(m, x, y);
  const segments: PathSegment[] = outline.segments.map((s) => {
    switch (s.op) {
      case "M": {
        const p = tf(s.x, s.y);
        return { op: "M", x: p.x, y: p.y };
      }
      case "L": {
        const p = tf(s.x, s.y);
        return { op: "L", x: p.x, y: p.y };
      }
      case "Q": {
        const c = tf(s.x1, s.y1);
        const p = tf(s.x, s.y);
        return { op: "Q", x1: c.x, y1: c.y, x: p.x, y: p.y };
      }
      case "C": {
        const c1 = tf(s.x1, s.y1);
        const c2 = tf(s.x2, s.y2);
        const p = tf(s.x, s.y);
        return { op: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
      }
      case "Z":
        return s;
    }
  });
  return { segments };
}

/** Convert a quadratic segment to an equivalent cubic (for PDF `c` ops). */
export function quadToCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x1: number; y1: number; x2: number; y2: number; x: number; y: number } {
  return {
    x1: x0 + (2 / 3) * (x1 - x0),
    y1: y0 + (2 / 3) * (y1 - y0),
    x2: x2 + (2 / 3) * (x1 - x2),
    y2: y2 + (2 / 3) * (y1 - y2),
    x: x2,
    y: y2,
  };
}
