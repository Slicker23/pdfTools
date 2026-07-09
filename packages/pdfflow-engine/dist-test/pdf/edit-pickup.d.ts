import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { type FontFamily } from "./fonts";
import { type FontKeyMeta } from "./font-weight";
export type { FontKeyMeta };
export { createFontKeyRegistry, initialWeightMap, finalizeFontWeightMap, recordStrokeScore } from "./font-weight";
/** Leading between baselines — must match editor.ts / text-metrics.ts. */
export declare const PDF_LINE_HEIGHT = 1.18;
export declare const DEFAULT_ASCENT_RATIO = 0.82;
export declare const DEFAULT_DESCENT_RATIO = 0.23;
interface RawSpan {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: FontFamily;
    bold: boolean;
    italic: boolean;
    hasEOL: boolean;
    ascentRatio: number;
    descentRatio: number;
    baselineY: number;
    fontKey: string;
    styleFamily?: string;
}
/** A clickable line or paragraph block from the source PDF. */
export interface PickableSpan {
    text: string;
    /** Bounding box in PDF user space (points, bottom-left origin). */
    px: number;
    py: number;
    pw: number;
    ph: number;
    fontSize: number;
    fontFamily: FontFamily;
    bold: boolean;
    italic: boolean;
    /** 1 = single line; >1 = paragraph block. */
    lineCount: number;
    ascentRatio: number;
    descentRatio: number;
    /** pdf.js font object id — one embedded font = one weight. */
    fontKey: string;
    /** PDF baseline Y for export alignment. */
    baselineY?: number;
    /** Canvas stroke density score (for page-level bold calibration). */
    strokeScore?: number;
    /** Ink bounds for whiteout (canvas-refined). */
    inkPx?: number;
    inkPy?: number;
    inkPw?: number;
    inkPh?: number;
}
/**
 * Extract clickable text regions grouped into lines and paragraphs.
 * Used to prefill a text box when editing existing content.
 */
export declare function extractRawSpans(page: PDFPageProxy): Promise<{
    raw: RawSpan[];
    registry: Map<string, FontKeyMeta>;
}>;
export declare function rawSpansToPickable(raw: RawSpan[], weightMap: Map<string, boolean>): PickableSpan[];
/** Apply finalized per-font weight map to pickable spans. */
export declare function applyFontWeightsToSpans(spans: PickableSpan[], weightMap: Map<string, boolean>): PickableSpan[];
export declare function getPickableSpans(page: PDFPageProxy): Promise<PickableSpan[]>;
/** Find the smallest region containing a PDF-space point (prefers tighter boxes). */
export declare function findSpanAtPoint(spans: PickableSpan[], x: number, y: number): PickableSpan | null;
/** Skip prefill when extracted text looks like a broken CMap (common on OCR scans). */
export declare function looksGarbled(text: string): boolean;
/**
 * Detect the text line under a canvas click (KillerPDF-style word run with column-gap
 * splitting). Returns a single pickable span for that line segment, or null if no text.
 */
export declare function pickTextLineAtPoint(page: PDFPageProxy, viewport: PageViewport, sx: number, sy: number): Promise<{
    pickable: PickableSpan;
    registry: Map<string, FontKeyMeta>;
} | null>;
/**
 * Sample the foreground (glyph) color inside a PDF-space rectangle by finding
 * pixels with the strongest contrast against the sampled background.
 */
export declare function sampleForegroundColor(canvas: HTMLCanvasElement, viewport: PageViewport, rect: {
    px: number;
    py: number;
    pw: number;
    ph: number;
}, backgroundHex?: string): string;
/**
 * Estimate glyph stroke weight from rendered pixels. Higher = bolder.
 * Uses horizontal neighbor density + vertical stem width in the glyph core.
 */
export declare function measureStrokeScore(data: Uint8ClampedArray, width: number, height: number, bgLum: number): number;
/** @deprecated Use {@link applyFontWeightsToSpans} with {@link finalizeFontWeightMap}. */
export declare function calibrateBoldForPage(spans: PickableSpan[]): PickableSpan[];
/**
 * Snap ink bounds to canvas glyphs; build em box aligned to ink top.
 */
export declare function refineSpanFromCanvas(canvas: HTMLCanvasElement, viewport: PageViewport, span: PickableSpan, backgroundHex: string): PickableSpan;
/**
 * Estimate the background color immediately around a PDF-space rectangle by
 * sampling the rendered page canvas just outside the box edges and taking the
 * brightest sample (background is typically lighter than glyphs).
 */
export declare function sampleBackgroundColor(canvas: HTMLCanvasElement, viewport: PageViewport, rect: {
    px: number;
    py: number;
    pw: number;
    ph: number;
}): string;
//# sourceMappingURL=edit-pickup.d.ts.map