/**
 * Isomorphic apply routing planner (M6 UX).
 *
 * Single source of truth for how a block patch is applied — shared by
 * server-side apply and browser worker UI prediction.
 */
import type { PdfEditBlockPatch, PdfEditBBox, PdfEditFont } from "@/lib/pdf/edit-model";
export type OverlayReason = "no-locator" | "style" | "unencodable" | "multiline" | "created" | "moved" | "outlined";
export type ApplyStrategy = "skip" | "overlay" | "native-in-place" | "native-move" | "native-insert" | "native-flatten";
export interface BlockOriginalSnapshot {
    text: string;
    font: PdfEditFont;
    bbox: PdfEditBBox;
    baselineY?: number;
    insertAt?: {
        px: number;
        py: number;
    };
    flattenToPath?: boolean;
    segments?: PdfEditBlockPatch["segments"];
}
export declare function isMergedBlock(block: PdfEditBlockPatch): boolean;
export interface ApplyPlan {
    strategy: ApplyStrategy;
    reason?: OverlayReason;
    /** True when pdf-lib whiteout+redraw will run (overlay fallback). */
    overlay: boolean;
}
export declare function bboxDiffers(a: PdfEditBBox, b: PdfEditBBox, epsilon?: number): boolean;
export declare function bboxMoved(block: PdfEditBlockPatch): boolean;
/** True when bold/italic/family can be swapped via page `/Font` resources (M9). */
export declare function canNativeFontSwap(block: PdfEditBlockPatch, original?: BlockOriginalSnapshot): boolean;
export declare function canNativeFlatten(block: PdfEditBlockPatch): boolean;
export declare function canNativeMove(block: PdfEditBlockPatch): boolean;
export declare function canPreEditForFlatten(block: PdfEditBlockPatch): boolean;
export declare function canNativeInPlace(block: PdfEditBlockPatch): boolean;
/** Route a changed block to an apply strategy (UI + worker). */
export declare function predictBlockApply(block: PdfEditBlockPatch, original?: BlockOriginalSnapshot): ApplyPlan;
/** @deprecated Use predictBlockApply().overlay */
export declare function willUseOverlay(block: PdfEditBlockPatch, original?: BlockOriginalSnapshot): {
    overlay: boolean;
    reason?: OverlayReason;
};
/** True when live text is whitespace-only but original had content (delete on download). */
export declare function willRemoveOnDownload(block: PdfEditBlockPatch, originalText: string | undefined): boolean;
/** Blocks that applyPatch would send to the pdf-lib overlay fallback. */
export declare function isOverlayBlock(block: PdfEditBlockPatch): boolean;
//# sourceMappingURL=plan.d.ts.map