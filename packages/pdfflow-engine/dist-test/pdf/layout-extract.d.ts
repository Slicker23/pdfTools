import type { CreateLayoutCanvas } from "./layout-canvas.types";
export interface LayoutSpan {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily?: string;
    bold: boolean;
    hasEOL?: boolean;
}
export interface LayoutLine {
    spans: LayoutSpan[];
    top: number;
    bottom: number;
    lineHeight: number;
}
export interface LayoutImage {
    data: Uint8Array;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    mime: "png" | "jpeg";
    source: "embedded" | "region" | "gap";
}
export interface PageLayout {
    page: number;
    width: number;
    height: number;
    lines: LayoutLine[];
    images: LayoutImage[];
    columns?: ColumnLayout;
}
export interface PdfLayoutResult {
    layouts: PageLayout[];
    isCvDocument: boolean;
}
export interface ColumnLayout {
    splitX: number;
    leftWidthPct: number;
    leftLines: LayoutLine[];
    rightLines: LayoutLine[];
    leftImages: LayoutImage[];
    rightImages: LayoutImage[];
    sidebarColor?: string;
}
/** Compute axis-aligned bounds from a PDF.js text item transform + width/height. */
export declare function textItemBounds(transform: number[], width: number, height: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** Merge left/right column lines that share the same row (e.g. CV layouts). */
export declare function mergeColumnLines(leftLines: LayoutLine[], rightLines: LayoutLine[], splitX: number): LayoutLine[];
/** Sample the sidebar background color from page 1 (for LibreOffice post-processing). */
export declare function sampleCvSidebarColor(file: File): Promise<string | undefined>;
export declare function detectTwoColumnPdf(file: File): Promise<boolean>;
/** Column split and page size from page 1 (for CV sidebar post-processing). */
export declare function getPageColumnMetrics(file: File, pageNum?: number): Promise<{
    twoColumn: boolean;
    splitX: number;
    pageHeight: number;
    pageWidth: number;
}>;
export interface PdfLayoutOptions {
    /** Skip image rendering and gap detection (faster, for text export). */
    textOnly?: boolean;
    /** Canvas factory — defaults to browser; worker passes server implementation. */
    createCanvas?: CreateLayoutCanvas;
}
export declare function extractPdfPageLayoutsFromBytes(data: Uint8Array, options?: PdfLayoutOptions): Promise<PdfLayoutResult>;
export declare function extractPdfPageLayouts(file: File, options?: PdfLayoutOptions): Promise<PdfLayoutResult>;
//# sourceMappingURL=layout-extract.d.ts.map