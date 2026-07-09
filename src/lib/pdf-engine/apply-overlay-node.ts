/**
 * Node.js overlay platform (pdfium bg sampling + fs Noto font).
 */
import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { PdfEditBBox } from "../pdf/edit-model";
import { sampleBgRgb } from "./apply-bg";
import type { OverlayPlatform } from "./apply-overlay";

const notoCache = new WeakMap<PDFDocument, PDFFont>();

async function resolveUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  const cached = notoCache.get(pdfDoc);
  if (cached) return cached;
  pdfDoc.registerFontkit(fontkit);
  const fontPath = path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf");
  const bytes = await readFile(fontPath);
  const font = await pdfDoc.embedFont(bytes, { subset: true });
  notoCache.set(pdfDoc, font);
  return font;
}

export const nodeOverlayPlatform: OverlayPlatform = {
  async sampleBgRgb(input, pageIdx, bbox, pageHeight) {
    return sampleBgRgb(Buffer.from(input), pageIdx, bbox, pageHeight);
  },
  loadUnicodeFont: resolveUnicodeFont,
};
