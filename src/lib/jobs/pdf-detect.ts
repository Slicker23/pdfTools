/** Server-side PDF layout helpers (Node.js, no DOM). */

import { analyzeColumns, type ColumnAnalysis } from "@/lib/pdf/column-detect";
import { textItemBounds } from "@/lib/pdf/layout-extract";

export interface PdfColumnInfo extends ColumnAnalysis {
  twoColumn: boolean;
  pageWidth: number;
  pageHeight: number;
}

export async function analyzePdfColumns(pdf: Buffer): Promise<PdfColumnInfo> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const spans: { x: number; width: number; y: number; height: number }[] = [];

  for (const item of tc.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const bounds = textItemBounds(
      item.transform,
      item.width ?? 0,
      item.height ?? 0
    );
    spans.push(bounds);
  }

  const analysis = analyzeColumns(spans, vp.width);

  return {
    twoColumn: analysis !== null,
    splitX: analysis?.splitX ?? vp.width * 0.38,
    leftWidthPct: analysis?.leftWidthPct ?? 38,
    leftCount: analysis?.leftCount ?? 0,
    rightCount: analysis?.rightCount ?? 0,
    pageWidth: vp.width,
    pageHeight: vp.height,
  };
}

export async function detectTwoColumnFromPdfBuffer(pdf: Buffer): Promise<boolean> {
  const info = await analyzePdfColumns(pdf);
  return info.twoColumn;
}
