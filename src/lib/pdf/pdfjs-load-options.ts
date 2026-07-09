/** Base URL path (with trailing slash) for pdf.js standard 14 font files. */
export const PDFJS_STANDARD_FONT_PATH = "/pdfjs/standard_fonts/";

function resolveStandardFontDataUrl(): string {
  const loc = (globalThis as typeof globalThis & { location?: { origin?: string } })
    .location;
  const origin = typeof loc?.origin === "string" ? loc.origin : "";
  return `${origin}${PDFJS_STANDARD_FONT_PATH}`;
}

/** Shared getDocument() init for pdf.js (main thread and dedicated pdf.js workers). */
export function pdfJsDocumentInit(data: ArrayBuffer | Uint8Array) {
  return {
    data,
    useWorkerFetch: false,
    useSystemFonts: false,
    isOffscreenCanvasSupported: typeof OffscreenCanvas !== "undefined",
    standardFontDataUrl: resolveStandardFontDataUrl(),
  };
}
