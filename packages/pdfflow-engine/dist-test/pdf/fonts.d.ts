import { type PDFDocument, type PDFFont } from "pdf-lib";
/**
 * Font families offered by the editor. "Standard" families use the 14 built-in
 * PDF fonts (no embedding, zero bytes). "Custom" families are bundled TTFs in
 * public/fonts and are embedded (subset) on export.
 */
export type FontFamily = "Helvetica" | "Times New Roman" | "Courier New" | "Roboto" | "Open Sans" | "Lato";
export declare const FONT_FAMILIES: FontFamily[];
export declare const DEFAULT_FONT_FAMILY: FontFamily;
export declare function fontFamilyCss(family: FontFamily): string;
/** CSS font-weight for overlay preview (matches @font-face 400/700 pairs). */
export declare function fontWeightCss(bold: boolean): number;
/** Font size in PDF points from a text item transform matrix. */
export declare function fontSizeFromPdfTransform(transform: number[], height?: number): number;
export interface ParsedFontTraits {
    family: FontFamily;
    bold: boolean;
    italic: boolean;
    /** How confidently weight was inferred from the PDF font name. */
    weightConfidence: "bold" | "regular" | "ambiguous";
}
/**
 * Infer family, weight, and style from PDF font names (e.g. "ABCDEE+Calibri-Bold").
 */
export declare function parseFontTraits(fontName?: string, styleFontFamily?: string): ParsedFontTraits;
/** Map a source-PDF font name to the nearest editor family (for text pickup). */
export declare function nearestFontFamily(fontName?: string): FontFamily;
/**
 * Resolve (and embed, if needed) a font for a document. Results are cached per
 * document so repeated text objects share one embedded font.
 */
export declare function resolveFont(doc: PDFDocument, family: FontFamily, bold: boolean, italic: boolean): Promise<PDFFont>;
//# sourceMappingURL=fonts.d.ts.map