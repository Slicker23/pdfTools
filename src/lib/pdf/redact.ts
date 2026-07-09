import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { PiiMatch, RedactionResult } from "@/lib/pii";
import { detectAndRedactPii, findPiiMatches } from "@/lib/pii";
import { initPdfJs } from "./pdfjs-config";

export interface PageTextLayout {
  page: number;
  text: string;
  boxes: TextBox[];
}

export interface TextBox {
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PiiScanResult {
  fullText: string;
  pageLayouts: PageTextLayout[];
  matches: PiiMatch[];
}

export interface PdfRedactResult {
  text: RedactionResult;
  pdf: Uint8Array;
  boxesDrawn: number;
}

export async function scanPdfForPii(file: File): Promise<PiiScanResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return scanPdfBytes(bytes);
}

export async function scanPdfBytes(bytes: Uint8Array): Promise<PiiScanResult> {
  const pdfjs =
    typeof window === "undefined"
      ? await import("pdfjs-dist/legacy/build/pdf.mjs")
      : await initPdfJs();
  const src = await pdfjs.getDocument({ data: bytes }).promise;
  const pageLayouts: PageTextLayout[] = [];
  const allMatches: PiiMatch[] = [];

  for (let pageNum = 1; pageNum <= src.numPages; pageNum++) {
    const page = await src.getPage(pageNum);
    const layout = buildPageLayout(await page.getTextContent(), pageNum);
    pageLayouts.push(layout);
    allMatches.push(...findPiiMatches(layout.text, pageNum));
  }

  const fullText = pageLayouts
    .map((p) => `--- Page ${p.page} ---\n${p.text}`)
    .join("\n\n")
    .trim();

  if (!fullText.replace(/--- Page \d+ ---/g, "").trim()) {
    const { PdfToolError } = await import("./errors");
    throw new PdfToolError(
      "This PDF has no extractable text. Run OCR first or use a PDF with a text layer.",
      "NO_TEXT"
    );
  }

  return { fullText, pageLayouts, matches: allMatches };
}

/** Compute axis-aligned bounds from a PDF.js text item transform + width/height. */
function textItemBounds(transform: number[], width: number, height: number) {
  const [a, b, c, d, e, f] = transform;
  const h = height || Math.hypot(c, d) || Math.abs(d) || Math.abs(a) || 12;

  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, h],
    [width, h],
  ].map(([px, py]) => [a * px + c * py + e, b * px + d * py + f] as [number, number]);

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function buildPageLayout(content: TextContent, pageNum: number): PageTextLayout {
  const boxes: TextBox[] = [];
  let text = "";
  let prevEndX: number | null = null;

  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;

    const bounds = textItemBounds(
      item.transform,
      item.width ?? 0,
      item.height ?? 0
    );

    // Insert a space only when there's a visible gap between text runs.
    if (text.length > 0) {
      const gap = prevEndX === null ? 0 : bounds.x - prevEndX;
      const fontSize = Math.hypot(item.transform[2], item.transform[3]) || bounds.height;
      if (gap > fontSize * 0.15) {
        text += " ";
      }
    }

    const start = text.length;
    text += item.str;
    const end = text.length;
    prevEndX = bounds.x + bounds.width;

    boxes.push({
      start,
      end,
      ...bounds,
    });
  }

  return { page: pageNum, text, boxes };
}

export async function redactPiiInPdf(
  file: File,
  selectedMatches: PiiMatch[],
  scan?: PiiScanResult
): Promise<PdfRedactResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return redactPiiInPdfBytes(bytes, selectedMatches, scan);
}

export async function redactPiiInPdfBytes(
  bytes: Uint8Array,
  selectedMatches: PiiMatch[],
  scan?: PiiScanResult
): Promise<PdfRedactResult> {
  const scanResult = scan ?? (await scanPdfBytes(bytes));
  const textResult = detectAndRedactPii(
    scanResult.fullText,
    new Set(selectedMatches.map((m) => m.value))
  );

  const { PDFDocument, rgb } = await import("pdf-lib");
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error("Could not open PDF for redaction");
  }

  const pages = pdfDoc.getPages();
  let boxesDrawn = 0;

  for (const match of selectedMatches) {
    const layout = scanResult.pageLayouts.find((p) => p.page === match.page);
    if (!layout) continue;
    const pdfPage = pages[match.page - 1];
    if (!pdfPage) continue;

    const range = findMatchRangeInPageText(layout.text, match.value, match.index);
    if (!range) continue;

    const bbox = unionBoxesForRange(layout.boxes, range.start, range.end);
    if (!bbox) continue;

    const pad = 1.5;
    pdfPage.drawRectangle({
      x: bbox.x - pad,
      y: bbox.y - pad,
      width: bbox.width + pad * 2,
      height: bbox.height + pad * 2,
      color: rgb(0, 0, 0),
    });
    boxesDrawn++;
  }

  return {
    text: textResult,
    pdf: await pdfDoc.save({ useObjectStreams: true }),
    boxesDrawn,
  };
}

export async function redactPiiInText(
  file: File,
  scan: PiiScanResult,
  selectedMatches: PiiMatch[]
): Promise<RedactionResult> {
  return {
    ...detectAndRedactPii(scan.fullText, new Set(selectedMatches.map((m) => m.value))),
    matches: scan.matches,
  };
}

function findMatchRangeInPageText(
  pageText: string,
  value: string,
  hintIndex: number
): { start: number; end: number } | null {
  if (pageText.slice(hintIndex, hintIndex + value.length) === value) {
    return { start: hintIndex, end: hintIndex + value.length };
  }
  const idx = pageText.indexOf(value);
  if (idx === -1) return null;
  return { start: idx, end: idx + value.length };
}

function unionBoxesForRange(
  boxes: TextBox[],
  start: number,
  end: number
): { x: number; y: number; width: number; height: number } | null {
  const hit = boxes.filter((b) => b.end > start && b.start < end);
  if (hit.length === 0) return null;

  const minX = Math.min(...hit.map((b) => b.x));
  const maxX = Math.max(...hit.map((b) => b.x + b.width));
  const minY = Math.min(...hit.map((b) => b.y));
  const maxY = Math.max(...hit.map((b) => b.y + b.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: Math.max(maxY - minY, 4),
  };
}
