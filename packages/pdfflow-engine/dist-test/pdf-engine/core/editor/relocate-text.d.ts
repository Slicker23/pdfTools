/**
 * Native text relocation (M5): replace a located show operator with a new Tm
 * and show at the target position, preserving the span's embedded font and scale.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { CosDocument } from "../document";
import type { EditLocator, SkipReason } from "./edit-text";
export interface TextMove {
    locator: EditLocator;
    /** Baseline x in PDF user space. */
    x: number;
    /** Baseline y in PDF user space. */
    y: number;
    text: string;
}
export interface MoveResult {
    output: Uint8Array;
    applied: EditLocator[];
    skipped: {
        locator: EditLocator;
        reason: SkipReason;
    }[];
}
/**
 * Relocate editable text runs by stripping the old show operator and appending
 * a new absolute-position run with the same embedded font.
 */
export declare function relocateTextRuns(doc: CosDocument, moves: TextMove[], deflate?: DeflateFn): Promise<MoveResult>;
/** Convenience: open bytes, relocate runs, return edited document. */
export declare function relocateTextRunsBytes(bytes: Uint8Array, moves: TextMove[], inflate: InflateFn, deflate?: DeflateFn): Promise<MoveResult>;
//# sourceMappingURL=relocate-text.d.ts.map