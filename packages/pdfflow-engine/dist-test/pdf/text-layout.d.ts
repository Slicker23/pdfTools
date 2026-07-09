import type { PdfEditBBox, PdfEditFont, PdfEditTextBlock } from "./edit-model";
/** Minimum inset from the page right edge when wrapping text. */
export declare const PAGE_TEXT_MARGIN = 12;
/** PDF leading between baselines (matches overlay apply). */
export declare const TEXT_LINE_HEIGHT = 1.2;
export type TextWidthMeasure = (text: string) => number;
/** Heuristic text width in PDF points (no font program required). */
export declare function estimateTextWidth(text: string, font: PdfEditFont): number;
export declare function defaultTextWidthMeasure(font: PdfEditFont): TextWidthMeasure;
/** Max line width for a block anchored at `blockPx` within a page. */
export declare function maxTextWidthForBlock(blockPx: number, columnWidth: number, pageW: number, margin?: number): number;
/** Word-wrap one paragraph to fit `maxWidth` (points). */
export declare function wrapParagraph(text: string, maxWidth: number, measure: TextWidthMeasure): string[];
/** Layout plain text into lines respecting explicit newlines and max width. */
export declare function layoutTextLines(text: string, font: PdfEditFont, pageW: number, blockPx: number, columnWidth: number, measure?: TextWidthMeasure): string[];
export interface TextLayoutResult {
    text: string;
    lines: string[];
    lineCount: number;
    bbox: PdfEditBBox;
    baselineY: number;
}
/** Compute wrapped lines and a page-fitting bbox for a text block. */
export declare function layoutBlockForPage(block: PdfEditTextBlock, pageW: number, measure?: TextWidthMeasure): TextLayoutResult;
/** Apply wrap layout and keep the block inside page bounds (position only). */
export declare function layoutBlockWithinPage(block: PdfEditTextBlock, pageW: number, pageH: number, measure?: TextWidthMeasure): PdfEditTextBlock;
//# sourceMappingURL=text-layout.d.ts.map