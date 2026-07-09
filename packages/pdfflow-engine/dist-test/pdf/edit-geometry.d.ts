import type { PdfEditBBox, PdfEditFont, PdfEditTextBlock } from "./edit-model";
/** True when text or font style changed (not position-only). */
export declare function contentDiffersFromOriginal(block: PdfEditTextBlock, original?: {
    text: string;
    font: PdfEditFont;
}): boolean;
export declare function effectiveBlockBounds(block: PdfEditTextBlock, page?: {
    width: number;
    height: number;
}): PdfEditBBox;
export declare function visualBlockBounds(block: PdfEditTextBlock, contentEdited: boolean, page?: {
    width: number;
    height: number;
}): PdfEditBBox;
export declare function translateBlockPosition(block: PdfEditTextBlock, deltaPx: number, deltaPy: number): Pick<PdfEditTextBlock, "bbox" | "baselineY" | "insertAt" | "segments">;
export declare function clampBlockToPage(block: PdfEditTextBlock, pageW: number, pageH: number, contentEdited?: boolean): PdfEditTextBlock;
//# sourceMappingURL=edit-geometry.d.ts.map