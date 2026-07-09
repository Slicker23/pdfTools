/**
 * @pdfflow/engine — public API
 *
 * Isomorphic PDF parse, text extract, and patch apply. Works in Node and modern
 * browsers when platform adapters are supplied.
 */
export { EDIT_MODEL_VERSION, buildPdfEditPatch, parsePdfEditDocument, parsePdfEditPatch, pdfEditBBoxSchema, pdfEditBlockPatchSchema, pdfEditDocumentSchema, pdfEditFontSchema, pdfEditPatchSchema, pdfEditTextBlockSchema, } from "../pdf/edit-model";
export type { PdfEditBBox, PdfEditBlockPatch, PdfEditDocument, PdfEditFont, PdfEditPage, PdfEditPatch, PdfEditTextBlock, } from "../pdf/edit-model";
export { clampBlockToPage, contentDiffersFromOriginal, effectiveBlockBounds, translateBlockPosition, visualBlockBounds, } from "../pdf/edit-geometry";
export { PAGE_TEXT_MARGIN, TEXT_LINE_HEIGHT, estimateTextWidth, layoutBlockForPage, layoutBlockWithinPage, layoutTextLines, maxTextWidthForBlock, wrapParagraph, } from "../pdf/text-layout";
export type { TextLayoutResult, TextWidthMeasure } from "../pdf/text-layout";
export * from "./core";
export { groupMergeableSpans, mergedSpanBbox, mergedSpanText, spanLeftEdge, spanRightEdge, spansMergeable, } from "./merge-text-spans";
export { applyIntentToState, blockContentIsChanged, blockIsChanged, cloneDocument, cloneOriginalSnapshot, computeSessionMeta, exportPatchFromDocument, snapshotFromBlock, withLiveFlags, withPatchFlags, } from "./edit-session-core";
export type { OriginalSnapshot, SessionIntent } from "./edit-session-core";
export { bboxDiffers, bboxMoved, canNativeFlatten, canNativeFontSwap, canNativeInPlace, canNativeMove, canPreEditForFlatten, isMergedBlock, isOverlayBlock, predictBlockApply, willRemoveOnDownload, willUseOverlay, } from "./plan";
export type { ApplyPlan, ApplyStrategy, BlockOriginalSnapshot, OverlayReason, } from "./plan";
export { applyFullPatch, applyOverlayFull } from "./apply-full";
export { applyNativePatch } from "./apply-native";
export type { ApplyNativeResult } from "./apply-native";
export { applyOverlayPatch, applyOverlayWithNativeStrip, } from "./apply-overlay";
export type { OverlayPlatform, Rgb01 } from "./apply-overlay";
export type { PlatformAdapters } from "./core/platform";
//# sourceMappingURL=public.d.ts.map