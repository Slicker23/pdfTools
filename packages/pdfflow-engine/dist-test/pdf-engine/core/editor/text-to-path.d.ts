import type { TextSpan } from "../content/types";
import type { OutlineFont } from "../fonts/outline-font";
import type { PathSegment } from "../fonts/outlines/types";
export declare function segmentsToPdfPath(segments: PathSegment[]): Uint8Array;
/** Build PDF content-stream bytes that paint a span's glyphs as filled paths. */
export declare function spanToPathContent(span: TextSpan, font: OutlineFont): Uint8Array | undefined;
/** Page-space bbox of span outlines (for tests). */
export declare function spanOutlineBBox(span: TextSpan, font: OutlineFont): [number, number, number, number] | undefined;
/** SVG path `d` for page-space segments (PDF y-up; flip in the view layer). */
export declare function segmentsToSvgD(segments: PathSegment[]): string;
//# sourceMappingURL=text-to-path.d.ts.map