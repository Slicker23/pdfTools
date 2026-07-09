/**
 * pdf-lib overlay apply (whiteout + redraw). Platform hooks for bg sampling and fonts.
 */
import { PDFDocument, type PDFFont } from "pdf-lib";
import type { PdfEditBBox, PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import type { PlatformAdapters } from "./core/platform";
export interface Rgb01 {
    r: number;
    g: number;
    b: number;
}
export interface OverlayPlatform {
    sampleBgRgb(input: Uint8Array, pageIdx: number, bbox: PdfEditBBox, pageHeight: number, blockId?: string): Promise<Rgb01>;
    loadUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont>;
}
/** True when block text still matches per-glyph segment layout (move/style overlay). */
export declare function segmentLayoutMatches(block: PdfEditBlockPatch): boolean;
/** Overlay-based apply (pdf-lib): whiteout + redraw. */
export declare function applyOverlayPatch(input: Uint8Array, blocks: PdfEditBlockPatch[], platform: OverlayPlatform): Promise<Uint8Array>;
/**
 * Overlay fallback that first strips original glyphs natively (when a locator
 * exists), then redraws with pdf-lib.
 */
export declare function applyOverlayWithNativeStrip(input: Uint8Array, blocks: PdfEditBlockPatch[], platform: OverlayPlatform, adapters: PlatformAdapters): Promise<Uint8Array>;
//# sourceMappingURL=apply-overlay.d.ts.map