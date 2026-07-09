/**
 * Browser overlay platform (fetch Noto + pre-sampled bg from canvas).
 */
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { OverlayPlatform, Rgb01 } from "./apply-overlay";

const notoCache = new WeakMap<PDFDocument, PDFFont>();

async function resolveUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  const cached = notoCache.get(pdfDoc);
  if (cached) return cached;
  pdfDoc.registerFontkit(fontkit);
  const res = await fetch("/fonts/NotoSans-Regular.ttf");
  if (!res.ok) throw new Error("Failed to load NotoSans font");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const font = await pdfDoc.embedFont(bytes, { subset: true });
  notoCache.set(pdfDoc, font);
  return font;
}

const WHITE: Rgb01 = { r: 1, g: 1, b: 1 };

/** Create an overlay platform with optional pre-sampled bg colors per block id. */
export function createBrowserOverlayPlatform(
  bgSamples?: Map<string, Rgb01>
): OverlayPlatform {
  return {
    async sampleBgRgb(_input, _pageIdx, _bbox, _pageHeight, blockId) {
      if (blockId && bgSamples?.has(blockId)) {
        return bgSamples.get(blockId)!;
      }
      return WHITE;
    },
    loadUnicodeFont: resolveUnicodeFont,
  };
}
