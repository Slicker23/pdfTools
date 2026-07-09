import type { PageViewport } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import type { PDFPageProxy } from "pdfjs-dist";
import { initPdfJs } from "./pdfjs-config";
import { PdfToolError } from "./errors";
import { analyzeColumns } from "./column-detect";
import type { CreateLayoutCanvas, LayoutCanvas } from "./layout-canvas.types";
import { createLayoutCanvas as createBrowserLayoutCanvas } from "./layout-canvas.browser";

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

const RENDER_SCALE = 2;
const GAP_CELL_PX = 20;
const GAP_MIN_PX = 36;

/** Compute axis-aligned bounds from a PDF.js text item transform + width/height. */
export function textItemBounds(transform: number[], width: number, height: number) {
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

type Ctm = [number, number, number, number, number, number];

function boundsFromCtm(ctm: Ctm, width: number, height: number) {
  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([px, py]) => [
    ctm[0] * px + ctm[2] * py + ctm[4],
    ctm[1] * px + ctm[3] * py + ctm[5],
  ] as [number, number]);

  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(Math.max(...xs) - minX, 1),
    height: Math.max(Math.max(...ys) - minY, 1),
  };
}

function multiplyCtm(a: Ctm, b: number[]): Ctm {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function imagePlacementKey(page: number, x: number, y: number, w: number, h: number): string {
  return `${page}:${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`;
}

function fontSizeFromTransform(transform: number[], height: number): number {
  const fromMatrix = Math.max(
    Math.hypot(transform[0], transform[1]),
    Math.hypot(transform[2], transform[3])
  );
  return fromMatrix || height || 12;
}

function mapFontName(fontName?: string): { fontFamily?: string; bold: boolean } {
  if (!fontName) return { bold: false };
  const lower = fontName.toLowerCase();
  const bold =
    lower.includes("bold") || lower.includes("black") || lower.includes("heavy");
  let fontFamily: string | undefined;
  if (lower.includes("times")) fontFamily = "Times New Roman";
  else if (lower.includes("courier") || lower.includes("mono")) fontFamily = "Courier New";
  else if (lower.includes("arial") || lower.includes("helvetica")) fontFamily = "Arial";
  return { fontFamily, bold };
}

function spansFromTextContent(content: TextContent): LayoutSpan[] {
  const spans: LayoutSpan[] = [];

  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;

    const bounds = textItemBounds(item.transform, item.width ?? 0, item.height ?? 0);
    const fontSize = fontSizeFromTransform(item.transform, bounds.height);
    const { fontFamily, bold } = mapFontName("fontName" in item ? item.fontName : undefined);

    spans.push({
      text: item.str,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fontSize,
      fontFamily,
      bold,
      hasEOL: item.hasEOL,
    });
  }

  return spans;
}

function groupIntoLines(spans: LayoutSpan[]): LayoutLine[] {
  if (spans.length === 0) return [];

  const lines: LayoutLine[] = [];
  let bucket: LayoutSpan[] = [spans[0]];
  let refTop = spans[0].y + spans[0].height;

  for (let i = 1; i < spans.length; i++) {
    const span = spans[i];
    const prev = spans[i - 1];
    const spanTop = span.y + span.height;
    const tolerance = Math.max(span.height, prev.height) * 0.45;
    const sameLine = !prev.hasEOL && Math.abs(spanTop - refTop) <= tolerance;

    if (sameLine) {
      bucket.push(span);
    } else {
      lines.push(buildLine(bucket));
      bucket = [span];
      refTop = spanTop;
    }
  }

  lines.push(buildLine(bucket));
  return lines;
}

function buildLine(spans: LayoutSpan[]): LayoutLine {
  const ordered = [...spans].sort((a, b) => a.x - b.x);
  const top = Math.max(...ordered.map((s) => s.y + s.height));
  const bottom = Math.min(...ordered.map((s) => s.y));
  const lineHeight = Math.max(...ordered.map((s) => s.height), 1);

  return { spans: ordered, top, bottom, lineHeight };
}

/** Merge left/right column lines that share the same row (e.g. CV layouts). */
export function mergeColumnLines(
  leftLines: LayoutLine[],
  rightLines: LayoutLine[],
  splitX: number
): LayoutLine[] {
  const rightFixed = rightLines.map((line) => ({
    ...line,
    spans: line.spans.map((s) => ({ ...s, x: s.x + splitX })),
  }));

  const all = [...leftLines, ...rightFixed].sort((a, b) => b.top - a.top);
  const merged: LayoutLine[] = [];

  for (const line of all) {
    const match = merged.find(
      (m) => Math.abs(m.top - line.top) <= Math.max(m.lineHeight, line.lineHeight) * 0.45
    );
    if (match) {
      match.spans = [...match.spans, ...line.spans].sort((a, b) => a.x - b.x);
      match.top = Math.max(match.top, line.top);
      match.bottom = Math.min(match.bottom, line.bottom);
      match.lineHeight = Math.max(match.lineHeight, line.lineHeight);
    } else {
      merged.push({ ...line, spans: [...line.spans] });
    }
  }

  return merged.sort((a, b) => b.top - a.top);
}

interface PdfImageData {
  data?: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  bitmap?: ImageBitmap;
}

async function openPdfDocument(data: Uint8Array) {
  if (typeof window === "undefined") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjs.getDocument({ data }).promise;
  }
  const pdfjs = await initPdfJs();
  return pdfjs.getDocument({ data }).promise;
}

async function loadPdfJsModule() {
  if (typeof window === "undefined") {
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return initPdfJs();
}

async function renderPageCanvas(
  page: PDFPageProxy,
  createCanvas: CreateLayoutCanvas,
  scale = RENDER_SCALE
) {
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = await createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas: canvas.asRenderTarget(),
  }).promise;
  return { canvas, viewport };
}

function resolvePdfObject(page: PDFPageProxy, objId: string): Promise<PdfImageData | null> {
  const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    store.get(objId, (obj: PdfImageData | null) => resolve(obj ?? null));
  });
}

async function imageDataToPngBytes(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  createCanvas: CreateLayoutCanvas
): Promise<Uint8Array> {
  const canvas = await createCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  const pixels = data.length / (width * height);

  if (pixels === 1) {
    for (let i = 0, p = 0; i < data.length; i++, p += 4) {
      const v = data[i];
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }
  } else if (pixels === 3) {
    for (let i = 0, p = 0; i < data.length; i += 3, p += 4) {
      imageData.data[p] = data[i];
      imageData.data[p + 1] = data[i + 1];
      imageData.data[p + 2] = data[i + 2];
      imageData.data[p + 3] = 255;
    }
  } else {
    imageData.data.set(data.subarray(0, width * height * 4));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toPngBytes();
}

async function pdfImageToPngBytes(
  img: PdfImageData,
  createCanvas: CreateLayoutCanvas
): Promise<Uint8Array | null> {
  if (img.bitmap && typeof document !== "undefined") {
    const canvas = await createCanvas(img.width, img.height);
    canvas.getContext("2d")!.drawImage(img.bitmap, 0, 0);
    return canvas.toPngBytes();
  }
  if (!img.data) return null;
  return imageDataToPngBytes(img.data, img.width, img.height, createCanvas);
}

function pdfRectToCanvasRect(
  viewport: PageViewport,
  rect: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const [x1, y1] = viewport.convertToViewportPoint(rect.x, rect.y);
  const [x2, y2] = viewport.convertToViewportPoint(
    rect.x + rect.width,
    rect.y + rect.height
  );
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

async function cropPdfRegion(
  canvas: LayoutCanvas,
  viewport: PageViewport,
  pageNum: number,
  pdfRect: { x: number; y: number; width: number; height: number },
  source: LayoutImage["source"],
  createCanvas: CreateLayoutCanvas
): Promise<LayoutImage | null> {
  const cr = pdfRectToCanvasRect(viewport, pdfRect);
  const x = Math.max(0, Math.floor(cr.x));
  const y = Math.max(0, Math.floor(cr.y));
  const w = Math.min(canvas.width - x, Math.ceil(cr.width));
  const h = Math.min(canvas.height - y, Math.ceil(cr.height));

  if (w < 4 || h < 4) return null;

  const crop = await createCanvas(w, h);
  const src = canvas.asRenderTarget();
  crop.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);

  return {
    data: await crop.toPngBytes(),
    page: pageNum,
    x: pdfRect.x,
    y: pdfRect.y,
    width: pdfRect.width,
    height: pdfRect.height,
    mime: "png",
    source,
  };
}

async function pushImageFromData(
  images: LayoutImage[],
  seen: Set<string>,
  pageNum: number,
  img: PdfImageData,
  ctm: Ctm,
  source: LayoutImage["source"],
  canvas: LayoutCanvas,
  viewport: PageViewport,
  createCanvas: CreateLayoutCanvas
): Promise<void> {
  const bounds = boundsFromCtm(ctm, img.width, img.height);
  const key = imagePlacementKey(pageNum, bounds.x, bounds.y, bounds.width, bounds.height);
  if (seen.has(key)) return;

  let data = await pdfImageToPngBytes(img, createCanvas);
  let image: LayoutImage | null = null;

  if (data) {
    seen.add(key);
    image = {
      data,
      page: pageNum,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      mime: "png",
      source,
    };
  } else {
    image = await cropPdfRegion(canvas, viewport, pageNum, bounds, "region", createCanvas);
    if (image) seen.add(key);
  }

  if (image) images.push(image);
}

async function extractPageImages(
  page: PDFPageProxy,
  pageNum: number,
  canvas: LayoutCanvas,
  viewport: PageViewport,
  createCanvas: CreateLayoutCanvas
): Promise<LayoutImage[]> {
  const pdfjs = await loadPdfJsModule();
  const ops = await page.getOperatorList();
  const { fnArray, argsArray } = ops;
  const { OPS } = pdfjs;

  let ctm: Ctm = [1, 0, 0, 1, 0, 0];
  const stack: Ctm[] = [];
  const images: LayoutImage[] = [];
  const seen = new Set<string>();

  for (let j = 0; j < fnArray.length; j++) {
    const fn = fnArray[j];
    const args = argsArray[j];

    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
      stack.push([...ctm]);
      if (fn === OPS.paintFormXObjectBegin && Array.isArray(args?.[0]) && args[0].length === 6) {
        ctm = multiplyCtm(ctm, args[0] as number[]);
      }
      continue;
    }

    if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }

    if (fn === OPS.transform && Array.isArray(args) && args.length === 6) {
      ctm = multiplyCtm(ctm, args as number[]);
      continue;
    }

    if (fn === OPS.paintInlineImageXObjectGroup && Array.isArray(args) && args.length >= 2) {
      const imgData = args[0] as PdfImageData;
      const map = args[1] as Array<{
        transform: number[];
        x: number;
        y: number;
        w: number;
        h: number;
      }>;
      if (imgData?.width && imgData.height && Array.isArray(map)) {
        for (const entry of map) {
          const localCtm = multiplyCtm(ctm, entry.transform);
          await pushImageFromData(
            images,
            seen,
            pageNum,
            { ...imgData, width: entry.w || imgData.width, height: entry.h || imgData.height },
            localCtm,
            "embedded",
            canvas,
            viewport,
            createCanvas
          );
        }
      }
      continue;
    }

    if (fn === OPS.paintImageXObjectRepeat && Array.isArray(args) && args.length >= 4) {
      const objId = args[0] as string;
      const scaleX = args[1] as number;
      const scaleY = args[2] as number;
      const positions = args[3] as number[];
      const img = await resolvePdfObject(page, objId);
      if (img?.width && img.height && Array.isArray(positions)) {
        for (let p = 0; p < positions.length; p += 2) {
          const localCtm = multiplyCtm(ctm, [
            scaleX,
            0,
            0,
            scaleY,
            positions[p],
            positions[p + 1],
          ]);
          await pushImageFromData(
            images,
            seen,
            pageNum,
            img,
            localCtm,
            "embedded",
            canvas,
            viewport,
            createCanvas
          );
        }
      }
      continue;
    }

    const isImage =
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject;

    if (isImage && Array.isArray(args) && args.length > 0) {
      let img: PdfImageData | null = null;

      if (fn === OPS.paintInlineImageXObject) {
        img = args[0] as PdfImageData;
      } else {
        const objId = args[0] as string;
        if (objId) img = await resolvePdfObject(page, objId);
      }

      if (img?.width && img.height) {
        await pushImageFromData(
          images,
          seen,
          pageNum,
          img,
          ctm,
          "embedded",
          canvas,
          viewport,
          createCanvas
        );
      }
      continue;
    }

    if (
      (fn === OPS.paintImageMaskXObject || fn === OPS.paintImageMaskXObjectRepeat) &&
      Array.isArray(args)
    ) {
      const maskArg = args[0] as { width?: number; height?: number } | undefined;
      const mw = maskArg?.width ?? 1;
      const mh = maskArg?.height ?? 1;

      if (fn === OPS.paintImageMaskXObjectRepeat && args.length >= 6) {
        const scaleX = args[1] as number;
        const skewX = (args[2] as number) ?? 0;
        const skewY = (args[3] as number) ?? 0;
        const scaleY = args[4] as number;
        const positions = args[5] as number[];
        if (Array.isArray(positions)) {
          for (let p = 0; p < positions.length; p += 2) {
            const localCtm = multiplyCtm(ctm, [
              scaleX,
              skewX,
              skewY,
              scaleY,
              positions[p],
              positions[p + 1],
            ]);
            const bounds = boundsFromCtm(localCtm, mw, mh);
            const key = imagePlacementKey(pageNum, bounds.x, bounds.y, bounds.width, bounds.height);
            if (seen.has(key)) continue;
            const cropped = await cropPdfRegion(canvas, viewport, pageNum, bounds, "region", createCanvas);
            if (cropped) {
              seen.add(key);
              images.push(cropped);
            }
          }
        }
      } else {
        const bounds = boundsFromCtm(ctm, mw, mh);
        const key = imagePlacementKey(pageNum, bounds.x, bounds.y, bounds.width, bounds.height);
        if (!seen.has(key)) {
          const cropped = await cropPdfRegion(canvas, viewport, pageNum, bounds, "region", createCanvas);
          if (cropped) {
            seen.add(key);
            images.push(cropped);
          }
        }
      }
    }
  }

  return images;
}

function detectColumnLayout(spans: LayoutSpan[], pageWidth: number): ColumnLayout | null {
  const analysis = analyzeColumns(spans, pageWidth);
  if (!analysis) return null;

  const splitX = analysis.splitX;
  const left = spans.filter((s) => s.x + s.width / 2 < splitX);
  const right = spans.filter((s) => s.x + s.width / 2 >= splitX);

  const leftLines = groupIntoLines(left);
  const rightLines = groupIntoLines(
    right.map((s) => ({ ...s, x: s.x - splitX }))
  );

  return {
    splitX,
    leftWidthPct: analysis.leftWidthPct,
    leftLines,
    rightLines,
    leftImages: [],
    rightImages: [],
  };
}

function splitImagesByColumn(
  images: LayoutImage[],
  splitX: number
): { left: LayoutImage[]; right: LayoutImage[] } {
  const left: LayoutImage[] = [];
  const right: LayoutImage[] = [];

  for (const img of images) {
    const cx = img.x + img.width / 2;
    if (cx < splitX) {
      left.push(img);
    } else {
      right.push({ ...img, x: img.x - splitX });
    }
  }

  return { left, right };
}

function sampleSidebarColor(
  canvas: LayoutCanvas,
  viewport: PageViewport,
  splitX: number,
  pageHeight: number
): string | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  const sampleRect = pdfRectToCanvasRect(viewport, {
    x: splitX * 0.35,
    y: pageHeight * 0.45,
    width: 8,
    height: 8,
  });

  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(sampleRect.x)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(sampleRect.y)));
  const d = ctx.getImageData(x, y, 1, 1).data;

  if (d[0] > 240 && d[1] > 240 && d[2] > 240) return undefined;

  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `${hex(d[0])}${hex(d[1])}${hex(d[2])}`;
}

/** Sample the sidebar background color from page 1 (for LibreOffice post-processing). */
export async function sampleCvSidebarColor(file: File): Promise<string | undefined> {
  const pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const { canvas, viewport } = await renderPageCanvas(page, createBrowserLayoutCanvas);
  const spans = spansFromTextContent(await page.getTextContent());
  const columnBase = detectColumnLayout(spans, baseViewport.width);
  if (!columnBase) return undefined;
  return sampleSidebarColor(canvas, viewport, columnBase.splitX, baseViewport.height);
}

export async function detectTwoColumnPdf(file: File): Promise<boolean> {
  const metrics = await getPageColumnMetrics(file);
  return metrics.twoColumn;
}

/** Column split and page size from page 1 (for CV sidebar post-processing). */
export async function getPageColumnMetrics(
  file: File,
  pageNum = 1
): Promise<{ twoColumn: boolean; splitX: number; pageHeight: number; pageWidth: number }> {
  const pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()));
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const spans = spansFromTextContent(await page.getTextContent());
  const columnBase = detectColumnLayout(spans, viewport.width);
  return {
    twoColumn: columnBase !== null,
    splitX: columnBase?.splitX ?? viewport.width * 0.38,
    pageHeight: viewport.height,
    pageWidth: viewport.width,
  };
}

function coverageRectsFromLayout(lines: LayoutLine[], images: LayoutImage[]) {
  const rects: { x: number; y: number; width: number; height: number }[] = [];

  for (const line of lines) {
    for (const span of line.spans) {
      rects.push({
        x: span.x - 1,
        y: span.y - 1,
        width: span.width + 2,
        height: span.height + 2,
      });
    }
  }

  for (const img of images) {
    if (img.source !== "gap") {
      rects.push({
        x: img.x - 2,
        y: img.y - 2,
        width: img.width + 4,
        height: img.height + 4,
      });
    }
  }

  return rects;
}

function cellCoverageFraction(
  rects: { x: number; y: number; width: number; height: number }[],
  cx: number,
  cy: number,
  size: number
): number {
  const cellArea = size * size;
  let covered = 0;

  for (const r of rects) {
    const ox = Math.max(0, Math.min(cx + size, r.x + r.width) - Math.max(cx, r.x));
    const oy = Math.max(0, Math.min(cy + size, r.y + r.height) - Math.max(cy, r.y));
    covered += ox * oy;
  }

  return Math.min(1, covered / cellArea);
}

function cellHasVisualContent(
  data: Uint8ClampedArray,
  canvasW: number,
  cx: number,
  cy: number,
  size: number
): boolean {
  let dark = 0;
  let total = 0;

  for (let y = cy; y < cy + size; y++) {
    for (let x = cx; x < cx + size; x++) {
      const i = (y * canvasW + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 248 || g < 248 || b < 248) dark++;
      total++;
    }
  }

  return dark / total > 0.04;
}

async function extractGapRegions(
  canvas: LayoutCanvas,
  viewport: PageViewport,
  pageNum: number,
  covered: { x: number; y: number; width: number; height: number }[],
  createCanvas: CreateLayoutCanvas,
  columnSplit?: number,
  side: "left" | "right" | "all" = "all"
): Promise<LayoutImage[]> {
  const canvasW = canvas.width;
  const canvasH = canvas.height;
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvasW, canvasH);

  const canvasCoverage = covered.map((r) => pdfRectToCanvasRect(viewport, r));
  const splitCanvasX = columnSplit
    ? pdfRectToCanvasRect(viewport, { x: columnSplit, y: 0, width: 1, height: 1 }).x
    : null;

  const cols = Math.ceil(canvasW / GAP_CELL_PX);
  const rows = Math.ceil(canvasH / GAP_CELL_PX);
  const gapGrid = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * GAP_CELL_PX;
      const cy = row * GAP_CELL_PX;

      if (splitCanvasX !== null) {
        if (side === "right" && cx + GAP_CELL_PX <= splitCanvasX + 4) continue;
        if (side === "left" && cx >= splitCanvasX - 4) continue;
      }
      if (cellCoverageFraction(canvasCoverage, cx, cy, GAP_CELL_PX) > 0.55) continue;
      if (!cellHasVisualContent(data, canvasW, cx, cy, GAP_CELL_PX)) continue;

      gapGrid[row * cols + col] = 1;
    }
  }

  const gaps: LayoutImage[] = [];
  const used = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      if (!gapGrid[idx] || used[idx]) continue;

      let minCol = col;
      let maxCol = col;
      let maxRow = row;

      while (maxCol + 1 < cols && gapGrid[row * cols + maxCol + 1] && !used[row * cols + maxCol + 1]) {
        maxCol++;
      }

      let canGrow = true;
      while (canGrow && maxRow + 1 < rows) {
        for (let c = minCol; c <= maxCol; c++) {
          const nextIdx = (maxRow + 1) * cols + c;
          if (!gapGrid[nextIdx] || used[nextIdx]) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) maxRow++;
      }

      for (let r = row; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          used[r * cols + c] = 1;
        }
      }

      const px = minCol * GAP_CELL_PX;
      const py = row * GAP_CELL_PX;
      const pw = (maxCol - minCol + 1) * GAP_CELL_PX;
      const ph = (maxRow - row + 1) * GAP_CELL_PX;

      if (pw < GAP_MIN_PX || ph < GAP_MIN_PX) continue;

      const pdfRect = viewport.convertToPdfPoint(px, py);
      const pdfRect2 = viewport.convertToPdfPoint(px + pw, py + ph);
      const pdfX = Math.min(pdfRect[0], pdfRect2[0]);
      const pdfY = Math.min(pdfRect[1], pdfRect2[1]);
      const pdfW = Math.abs(pdfRect2[0] - pdfRect[0]);
      const pdfH = Math.abs(pdfRect2[1] - pdfRect[1]);

      const cropped = await cropPdfRegion(
        canvas,
        viewport,
        pageNum,
        { x: pdfX, y: pdfY, width: pdfW, height: pdfH },
        "gap",
        createCanvas
      );
      if (cropped) gaps.push(cropped);
    }
  }

  return gaps;
}

export interface PdfLayoutOptions {
  /** Skip image rendering and gap detection (faster, for text export). */
  textOnly?: boolean;
  /** Canvas factory — defaults to browser; worker passes server implementation. */
  createCanvas?: CreateLayoutCanvas;
}

export async function extractPdfPageLayoutsFromBytes(
  data: Uint8Array,
  options: PdfLayoutOptions = {}
): Promise<PdfLayoutResult> {
  const textOnly = options.textOnly ?? false;
  const createCanvas = options.createCanvas ?? createBrowserLayoutCanvas;
  const pdf = await openPdfDocument(data);
  const layouts: PageLayout[] = [];
  let isCvDocument = false;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });

    let canvas: LayoutCanvas | null = null;
    let viewport = baseViewport;
    if (!textOnly) {
      const rendered = await renderPageCanvas(page, createCanvas);
      canvas = rendered.canvas;
      viewport = rendered.viewport;
    }

    const spans = spansFromTextContent(await page.getTextContent());
    const columnBase = detectColumnLayout(spans, baseViewport.width);
    if (columnBase) isCvDocument = true;

    const lines = columnBase
      ? mergeColumnLines(columnBase.leftLines, columnBase.rightLines, columnBase.splitX)
      : groupIntoLines(spans);

    let usableImages: LayoutImage[] = [];
    let gapImages: LayoutImage[] = [];

    if (!textOnly && canvas) {
      const embeddedImages = await extractPageImages(
        page,
        pageNum,
        canvas,
        viewport,
        createCanvas
      );
      usableImages = embeddedImages.filter((img) => img.width >= 16 && img.height >= 16);

      if (columnBase) {
        // Gap detection in the sidebar produces false image strips — use embedded images only.
        gapImages = [];
      } else if (!isCvDocument) {
        gapImages = await extractGapRegions(
          canvas,
          viewport,
          pageNum,
          coverageRectsFromLayout(lines, embeddedImages),
          createCanvas
        );
      }
    }

    let columns: ColumnLayout | undefined;
    if (columnBase) {
      const split = splitImagesByColumn([...usableImages, ...gapImages], columnBase.splitX);
      columns = {
        ...columnBase,
        leftImages: split.left.filter((img) => img.height < baseViewport.height * 0.45),
        rightImages: split.right.filter(
          (img) => img.width >= 20 && img.height < baseViewport.height * 0.45
        ),
        sidebarColor:
          !textOnly && canvas
            ? sampleSidebarColor(canvas, viewport, columnBase.splitX, baseViewport.height)
            : undefined,
      };
    }

    layouts.push({
      page: pageNum,
      width: baseViewport.width,
      height: baseViewport.height,
      lines,
      images: [...usableImages, ...gapImages],
      columns,
    });
  }

  const hasText = layouts.some((p) => p.lines.some((l) => l.spans.length > 0));
  const hasImages = layouts.some((p) => p.images.length > 0);

  if (!hasText && !hasImages) {
    throw new PdfToolError(
      "This PDF has no selectable text or extractable content. Run OCR first, or use the server converter.",
      "NO_TEXT"
    );
  }

  return { layouts, isCvDocument };
}

export async function extractPdfPageLayouts(
  file: File,
  options: PdfLayoutOptions = {}
): Promise<PdfLayoutResult> {
  return extractPdfPageLayoutsFromBytes(
    new Uint8Array(await file.arrayBuffer()),
    options
  );
}
