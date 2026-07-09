/** Base URL path (with trailing slash) for pdf.js standard 14 font files. */
export declare const PDFJS_STANDARD_FONT_PATH = "/pdfjs/standard_fonts/";
/** Shared getDocument() init for pdf.js (main thread and dedicated pdf.js workers). */
export declare function pdfJsDocumentInit(data: ArrayBuffer | Uint8Array): {
    data: ArrayBuffer | Uint8Array<ArrayBufferLike>;
    useWorkerFetch: boolean;
    useSystemFonts: boolean;
    isOffscreenCanvasSupported: boolean;
    standardFontDataUrl: string;
};
//# sourceMappingURL=pdfjs-load-options.d.ts.map