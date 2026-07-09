/**
 * Vector path types for glyph outlines (M6).
 *
 * Coordinates are in font glyph space (typically 1000 units per em, y-up).
 */
export type PathSegment = {
    op: "M";
    x: number;
    y: number;
} | {
    op: "L";
    x: number;
    y: number;
} | {
    op: "Q";
    x1: number;
    y1: number;
    x: number;
    y: number;
} | {
    op: "C";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x: number;
    y: number;
} | {
    op: "Z";
};
export interface GlyphOutline {
    segments: PathSegment[];
}
/** Axis-aligned bounds of path segments. Returns undefined for empty paths. */
export declare function outlineBBox(segments: PathSegment[]): [number, number, number, number] | undefined;
//# sourceMappingURL=types.d.ts.map