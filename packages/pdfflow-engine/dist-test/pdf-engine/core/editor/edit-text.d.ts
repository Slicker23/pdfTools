/**
 * High-level in-place text editor (M5).
 *
 * `editText` rewrites the shown text of individual runs in a PDF and saves the
 * result as an incremental update, so untouched bytes stay byte-identical and
 * the original embedded fonts are reused. Each edit targets a run by its locator
 * (page + content-stream object number + byte offset), produced by the extractor.
 *
 * Runs that cannot be edited natively are reported in `skipped` (with a reason)
 * and left untouched, so a caller can fall back to an overlay for those.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { CosDocument } from "../document";
/** Identifies one editable run within a document. */
export interface EditLocator {
    page: number;
    streamNum: number;
    regionStart: number;
}
export interface TextEdit {
    locator: EditLocator;
    /** New text for the run; empty string deletes the run's glyphs. */
    newText: string;
    /** Hex fill color (#rrggbb); applied natively when the run is in an isolated BT block. */
    newColor?: string;
    /** Target visual size (page space); rescales Tf/Tm in isolated BT blocks. */
    newSize?: number;
    /** Extract-time color/size — used to detect style edits vs the PDF span. */
    originalColor?: string;
    originalSize?: number;
    /** Target font family; swaps `/Font` resource when a page match exists (M9). */
    newFontFamily?: string;
    newBold?: boolean;
    newItalic?: boolean;
}
export type SkipReason = "encrypted" | "recovered" | "not-found" | "not-editable" | "unencodable";
export interface EditResult {
    output: Uint8Array;
    applied: EditLocator[];
    skipped: {
        locator: EditLocator;
        reason: SkipReason;
    }[];
}
/** Encode a locator as a stable, free-form block id (`p1:s4:o128`). */
export declare function encodeLocator(loc: EditLocator): string;
/** Parse a locator id produced by {@link encodeLocator}; undefined if malformed. */
export declare function decodeLocator(id: string): EditLocator | undefined;
/**
 * Apply in-place text edits to an already-open document. Returns the edited
 * bytes plus per-edit outcomes. Encrypted or recovered documents are left
 * untouched (all edits skipped), so callers can fall back to an overlay.
 */
export declare function editText(doc: CosDocument, edits: TextEdit[], deflate?: DeflateFn): Promise<EditResult>;
/** Convenience: open `bytes`, apply edits, and return the edited document. */
export declare function editTextBytes(bytes: Uint8Array, edits: TextEdit[], inflate: InflateFn, deflate?: DeflateFn): Promise<EditResult>;
//# sourceMappingURL=edit-text.d.ts.map