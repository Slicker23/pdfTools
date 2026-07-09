/**
 * Path transforms for glyph outlines (M6).
 */
import type { Matrix } from "../../content/matrix";
import type { GlyphOutline } from "./types";
/** Apply a 2×3 PDF matrix to every point in a glyph outline. */
export declare function transformOutline(outline: GlyphOutline, m: Matrix): GlyphOutline;
/** Convert a quadratic segment to an equivalent cubic (for PDF `c` ops). */
export declare function quadToCubic(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x: number;
    y: number;
};
//# sourceMappingURL=transform.d.ts.map