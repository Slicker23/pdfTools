import type { RGBA, TextSpan } from "../content/types";
import type { EditLocator } from "./edit-text";
import type { CosDocument } from "../document";
import type { OutlineFont } from "../fonts/outline-font";
import type { PathSegment } from "../fonts/outlines/types";
/** Page-space path segments for each glyph in a span. */
export declare function collectSpanOutlinePaths(span: TextSpan, font: OutlineFont): {
    glyphs: PathSegment[][];
    fillColor?: RGBA;
    bbox?: [number, number, number, number];
} | undefined;
/** Resolve a block locator to page-space outline paths via the open document. */
export declare function getBlockOutlinePaths(doc: CosDocument, locator: EditLocator): Promise<{
    glyphs: PathSegment[][];
    fillColor?: RGBA;
    bbox?: [number, number, number, number];
} | undefined>;
//# sourceMappingURL=outline-preview.d.ts.map