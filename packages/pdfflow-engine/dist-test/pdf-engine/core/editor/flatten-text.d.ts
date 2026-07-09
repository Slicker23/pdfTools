/**
 * Flatten text runs to vector paths (M6).
 *
 * Replaces a located show operator with filled path operators built from the
 * embedded font's glyph outlines.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { CosDocument } from "../document";
import type { EditLocator, SkipReason } from "./edit-text";
export interface TextFlatten {
    locator: EditLocator;
}
export interface FlattenResult {
    output: Uint8Array;
    applied: EditLocator[];
    skipped: {
        locator: EditLocator;
        reason: SkipReason;
    }[];
}
export declare function flattenTextRuns(doc: CosDocument, flattens: TextFlatten[], deflate?: DeflateFn): Promise<FlattenResult>;
export declare function flattenTextRunsBytes(bytes: Uint8Array, flattens: TextFlatten[], inflate: InflateFn, deflate?: DeflateFn): Promise<FlattenResult>;
//# sourceMappingURL=flatten-text.d.ts.map