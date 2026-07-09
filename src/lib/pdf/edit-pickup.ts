import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { textItemBounds } from "./layout-extract";
import {
  fontSizeFromPdfTransform,
  parseFontTraits,
  type FontFamily,
} from "./fonts";
import {
  createFontKeyRegistry,
  initialWeightMap,
  isBoldForFontKey,
  registerFontKey,
  type FontKeyMeta,
} from "./font-weight";

export type { FontKeyMeta };
export { createFontKeyRegistry, initialWeightMap, finalizeFontWeightMap, recordStrokeScore } from "./font-weight";

/** Leading between baselines — must match editor.ts / text-metrics.ts. */
export const PDF_LINE_HEIGHT = 1.18;

export const DEFAULT_ASCENT_RATIO = 0.82;
export const DEFAULT_DESCENT_RATIO = 0.23;

interface PdfTextStyle {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
}

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

function styleRatios(style: PdfTextStyle | undefined): { ascentRatio: number; descentRatio: number } {
  const ascentRatio =
    style?.ascent != null && style.ascent > 0 ? style.ascent : DEFAULT_ASCENT_RATIO;
  const descentRatio =
    style?.descent != null ? Math.abs(style.descent) : DEFAULT_DESCENT_RATIO;
  return { ascentRatio, descentRatio };
}

/**
 * pdf.js `TextItem.width` / `.height` are already in PDF user space — do not
 * scale them again through the text matrix (that inflates bounds ~fontSize×).
 */
function rawSpanFromItem(
  item: TextItem,
  styles: Record<string, PdfTextStyle>
): RawSpan | null {
  if (!item.str?.trim()) return null;

  const [a, b, c, d, e, f] = item.transform;
  const w = item.width ?? 0;
  const style = styles[item.fontName];
  const styleName = style?.fontFamily;
  const traits = parseFontTraits(item.fontName, styleName);
  const fontSize = fontSizeFromPdfTransform(item.transform, item.height ?? 0);
  const { ascentRatio, descentRatio } = styleRatios(style);
  const ascent = ascentRatio * fontSize;
  const descent = descentRatio * fontSize;

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (Math.abs(b) < 0.01 && Math.abs(c) < 0.01) {
    x = e;
    y = f - descent;
    width = Math.max(w, 1);
    height = ascent + descent;
  } else {
    const bounds = textItemBounds(item.transform, w, item.height ?? 0);
    x = bounds.x;
    y = bounds.y;
    width = bounds.width;
    height = bounds.height;
  }

  return {
    text: item.str,
    x,
    y,
    width,
    height,
    fontSize,
    fontFamily: traits.family,
    bold: traits.bold,
    italic: traits.italic,
    hasEOL: item.hasEOL ?? false,
    ascentRatio,
    descentRatio,
    baselineY: f,
    fontKey: item.fontName,
    styleFamily: styleName,
  };
}

function spanBold(span: RawSpan | PickableSpan, weightMap: Map<string, boolean>): boolean {
  return isBoldForFontKey(weightMap, span.fontKey, span.bold);
}

function stylesMatch(
  a: RawSpan,
  b: RawSpan,
  weightMap: Map<string, boolean>
): boolean {
  return (
    a.fontKey === b.fontKey &&
    Math.abs(a.fontSize - b.fontSize) < 0.25 &&
    a.italic === b.italic &&
    spanBold(a, weightMap) === spanBold(b, weightMap)
  );
}

function mergeSpans(a: RawSpan, b: RawSpan): RawSpan {
  const gap = b.x - (a.x + a.width);
  const needsSpace =
    gap > 1 &&
    !/\s$/.test(a.text) &&
    !/^\s/.test(b.text) &&
    !/^[,;:.!?|)]/.test(b.text);
  const px = Math.min(a.x, b.x);
  const py = Math.min(a.y, b.y);
  const pr = Math.max(a.x + a.width, b.x + b.width);
  const pt = Math.max(a.y + a.height, b.y + b.height);
  return {
    ...a,
    text: (needsSpace ? `${a.text} ` : a.text) + b.text,
    x: px,
    y: py,
    width: pr - px,
    height: pt - py,
    hasEOL: b.hasEOL,
  };
}

/** Group glyphs that share the same PDF baseline (one visual line). */
function groupByBaseline(raw: RawSpan[]): RawSpan[][] {
  const sorted = [...raw].sort((a, b) => b.baselineY - a.baselineY || a.x - b.x);
  const lines: RawSpan[][] = [];

  for (const span of sorted) {
    let placed = false;
    for (const line of lines) {
      const ref = line[0];
      const tol = Math.max(span.fontSize, ref.fontSize) * 0.35;
      if (Math.abs(span.baselineY - ref.baselineY) <= tol) {
        line.push(span);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([span]);
  }

  return lines;
}

/** Merge adjacent same-style runs on one line; emit one pickable block per run. */
function pickablesFromLine(spans: RawSpan[], weightMap: Map<string, boolean>): PickableSpan[] {
  const ordered = [...spans].sort((a, b) => a.x - b.x);
  if (ordered.length === 0) return [];

  const merged: RawSpan[] = [];
  let cur = ordered[0];

  for (let i = 1; i < ordered.length; i++) {
    const next = ordered[i];
    const gap = next.x - (cur.x + cur.width);
    const maxGap = Math.max(cur.fontSize, next.fontSize) * 0.75;

    if (!cur.hasEOL && stylesMatch(cur, next, weightMap) && gap <= maxGap) {
      cur = mergeSpans(cur, next);
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);

  return merged.map((s) => rawSpanToPickable(s, weightMap));
}

function rawSpanToPickable(span: RawSpan, weightMap: Map<string, boolean>): PickableSpan {
  return {
    text: span.text.trim(),
    px: span.x,
    py: span.y,
    pw: Math.max(span.width, 1),
    ph: Math.max(span.height, 1),
    fontSize: span.fontSize,
    fontFamily: span.fontFamily,
    bold: isBoldForFontKey(weightMap, span.fontKey, span.bold),
    italic: span.italic,
    lineCount: 1,
    ascentRatio: span.ascentRatio,
    descentRatio: span.descentRatio,
    fontKey: span.fontKey,
    baselineY: span.baselineY,
  };
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
export async function extractRawSpans(page: PDFPageProxy): Promise<{
  raw: RawSpan[];
  registry: Map<string, FontKeyMeta>;
}> {
  const registry = createFontKeyRegistry();
  const content = await page.getTextContent();
  const styles = content.styles as Record<string, PdfTextStyle>;
  const raw: RawSpan[] = [];

  for (const item of content.items) {
    if (!("str" in item)) continue;
    const span = rawSpanFromItem(item, styles);
    if (!span) continue;
    registerFontKey(registry, span.fontKey, span.styleFamily, span.fontSize);
    raw.push(span);
  }

  return { raw, registry };
}

export function rawSpansToPickable(
  raw: RawSpan[],
  weightMap: Map<string, boolean>
): PickableSpan[] {
  return groupByBaseline(raw).flatMap((line) => pickablesFromLine(line, weightMap));
}

/** Apply finalized per-font weight map to pickable spans. */
export function applyFontWeightsToSpans(
  spans: PickableSpan[],
  weightMap: Map<string, boolean>
): PickableSpan[] {
  return spans.map((s) => ({
    ...s,
    bold: isBoldForFontKey(weightMap, s.fontKey, s.bold),
  }));
}

export async function getPickableSpans(page: PDFPageProxy): Promise<PickableSpan[]> {
  const { raw, registry } = await extractRawSpans(page);
  return rawSpansToPickable(raw, initialWeightMap(registry));
}

/** Find the smallest region containing a PDF-space point (prefers tighter boxes). */
export function findSpanAtPoint(
  spans: PickableSpan[],
  x: number,
  y: number
): PickableSpan | null {
  let best: PickableSpan | null = null;
  let bestArea = Infinity;

  for (const s of spans) {
    if (x < s.px || x > s.px + s.pw || y < s.py || y > s.py + s.ph) continue;
    const area = s.pw * s.ph;
    if (area < bestArea) {
      best = s;
      bestArea = area;
    }
  }

  return best;
}

export { looksGarbled } from "./text-quality";

interface ScreenWordRect {
  span: RawSpan;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function rawSpanToScreenRect(span: RawSpan, viewport: PageViewport): ScreenWordRect {
  const [x1, y1] = viewport.convertToViewportPoint(span.x, span.y + span.height) as [
    number,
    number,
  ];
  const [x2, y2] = viewport.convertToViewportPoint(span.x + span.width, span.y) as [
    number,
    number,
  ];
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return {
    span,
    left,
    top,
    right,
    bottom,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

function mergeRawLine(spans: RawSpan[], weightMap: Map<string, boolean>): PickableSpan {
  const ordered = [...spans].sort((a, b) => a.x - b.x);
  let cur = ordered[0];
  for (let i = 1; i < ordered.length; i++) {
    cur = mergeSpans(cur, ordered[i]);
  }
  return rawSpanToPickable(cur, weightMap);
}

/**
 * Detect the text line under a canvas click (KillerPDF-style word run with column-gap
 * splitting). Returns a single pickable span for that line segment, or null if no text.
 */
export async function pickTextLineAtPoint(
  page: PDFPageProxy,
  viewport: PageViewport,
  sx: number,
  sy: number
): Promise<{ pickable: PickableSpan; registry: Map<string, FontKeyMeta> } | null> {
  const { raw, registry } = await extractRawSpans(page);
  if (raw.length === 0) return null;

  const weightMap = initialWeightMap(registry);
  const canvasWords = raw.map((span) => rawSpanToScreenRect(span, viewport));

  let lineWords = canvasWords
    .filter((cw) => sy >= cw.top - 3 && sy <= cw.bottom + 3)
    .sort((a, b) => a.left - b.left);

  if (lineWords.length === 0) {
    const nearest = canvasWords.reduce(
      (best, cw) => {
        const midY = (cw.top + cw.bottom) / 2;
        const dist = Math.abs(midY - sy);
        return dist < best.dist ? { cw, dist } : best;
      },
      { cw: canvasWords[0], dist: Infinity }
    );
    const nearMidY = (nearest.cw.top + nearest.cw.bottom) / 2;
    lineWords = canvasWords
      .filter((cw) => Math.abs((cw.top + cw.bottom) / 2 - nearMidY) < 5)
      .sort((a, b) => a.left - b.left);
  }

  if (lineWords.length === 0) return null;

  if (lineWords.length > 1) {
    let ci = 0;
    let bestDx = Infinity;
    for (let i = 0; i < lineWords.length; i++) {
      const r = lineWords[i];
      const dx =
        sx < r.left ? r.left - sx : sx > r.right ? sx - r.right : 0;
      if (dx < bestDx) {
        bestDx = dx;
        ci = i;
      }
    }
    const gapMax = Math.max(lineWords[ci].height * 1.5, 24);
    let lo = ci;
    let hi = ci;
    while (lo > 0 && lineWords[lo].left - lineWords[lo - 1].right <= gapMax) lo--;
    while (
      hi < lineWords.length - 1 &&
      lineWords[hi + 1].left - lineWords[hi].right <= gapMax
    ) {
      hi++;
    }
    lineWords = lineWords.slice(lo, hi + 1);
  }

  const pickable = mergeRawLine(
    lineWords.map((cw) => cw.span),
    weightMap
  );
  if (!pickable.text.trim()) return null;

  return { pickable, registry };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function canvasRectFromPdf(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  rect: { px: number; py: number; pw: number; ph: number }
) {
  const [x1, y1] = viewport.convertToViewportPoint(rect.px, rect.py) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(rect.px + rect.pw, rect.py + rect.ph) as [
    number,
    number,
  ];
  const left = Math.max(0, Math.floor(Math.min(x1, x2)));
  const top = Math.max(0, Math.floor(Math.min(y1, y2)));
  const right = Math.min(canvas.width, Math.ceil(Math.max(x1, x2)));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(y1, y2)));
  return { left, top, width: Math.max(right - left, 1), height: Math.max(bottom - top, 1) };
}

/**
 * Sample the foreground (glyph) color inside a PDF-space rectangle by finding
 * pixels with the strongest contrast against the sampled background.
 */
export function sampleForegroundColor(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  rect: { px: number; py: number; pw: number; ph: number },
  backgroundHex = "#ffffff"
): string {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#111111";

  const { left, top, width, height } = canvasRectFromPdf(canvas, viewport, rect);
  const data = ctx.getImageData(left, top, width, height).data;
  const bg = parseHex(backgroundHex);
  const bgLum = luminance(bg.r, bg.g, bg.b);

  let best: { r: number; g: number; b: number } | null = null;
  let bestContrast = 0;

  for (let py = 0; py < height; py += Math.max(1, Math.floor(height / 8))) {
    for (let px = 0; px < width; px += Math.max(1, Math.floor(width / 8))) {
      const i = (py * width + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      const contrast = Math.abs(luminance(r, g, b) - bgLum);
      if (contrast > 25 && contrast > bestContrast) {
        bestContrast = contrast;
        best = { r, g, b };
      }
    }
  }

  if (best) return rgbToHex(best.r, best.g, best.b);

  // Fallback: pick pixel farthest from background luminance.
  for (let py = 0; py < height; py += Math.max(1, Math.floor(height / 6))) {
    for (let px = 0; px < width; px += Math.max(1, Math.floor(width / 6))) {
      const i = (py * width + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const contrast = Math.abs(luminance(r, g, b) - bgLum);
      if (contrast > bestContrast) {
        bestContrast = contrast;
        best = { r, g, b };
      }
    }
  }

  return best ? rgbToHex(best.r, best.g, best.b) : bgLum > 128 ? "#111111" : "#ffffff";
}

function isForegroundPixel(
  data: Uint8ClampedArray,
  i: number,
  bgLum: number,
  threshold = 20
): boolean {
  if (data[i + 3] < 128) return false;
  return Math.abs(luminance(data[i], data[i + 1], data[i + 2]) - bgLum) > threshold;
}

/**
 * Estimate glyph stroke weight from rendered pixels. Higher = bolder.
 * Uses horizontal neighbor density + vertical stem width in the glyph core.
 */
export function measureStrokeScore(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bgLum: number
): number {
  if (width < 2 || height < 2) return 0;

  const y0 = Math.floor(height * 0.32);
  const y1 = Math.floor(height * 0.68);
  let fgCount = 0;
  let neighborSum = 0;
  const stemRuns: number[] = [];

  for (let y = y0; y <= y1; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const fg = isForegroundPixel(data, i, bgLum, 18);
      if (fg) {
        fgCount++;
        run++;
        let neighbors = 0;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const ni = (y * width + nx) * 4;
          if (isForegroundPixel(data, ni, bgLum, 18)) neighbors++;
        }
        neighborSum += neighbors;
      } else if (run > 0) {
        stemRuns.push(run);
        run = 0;
      }
    }
    if (run > 0) stemRuns.push(run);
  }

  if (fgCount === 0) return 0;
  const avgNeighbors = neighborSum / fgCount;
  const density = fgCount / (width * height);
  stemRuns.sort((a, b) => b - a);
  const topStem =
    stemRuns.length > 0
      ? stemRuns.slice(0, Math.max(1, Math.floor(stemRuns.length * 0.2))).reduce((a, b) => a + b, 0) /
        Math.max(1, Math.floor(stemRuns.length * 0.2))
      : 0;

  return avgNeighbors * 0.55 + density * width * 1.4 + topStem * 0.85;
}

/** @deprecated Use {@link applyFontWeightsToSpans} with {@link finalizeFontWeightMap}. */
export function calibrateBoldForPage(spans: PickableSpan[]): PickableSpan[] {
  return spans;
}

/**
 * Snap ink bounds to canvas glyphs; build em box aligned to ink top.
 */
export function refineSpanFromCanvas(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  span: PickableSpan,
  backgroundHex: string
): PickableSpan {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return span;

  const { left, top, width, height } = canvasRectFromPdf(canvas, viewport, span);
  if (width < 2 || height < 2) return span;

  const data = ctx.getImageData(left, top, width, height).data;
  const bg = parseHex(backgroundHex);
  const bgLum = luminance(bg.r, bg.g, bg.b);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isForegroundPixel(data, i, bgLum)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) return span;

  const strokeScore = measureStrokeScore(data, width, height, bgLum);

  const textLineCount = Math.max(span.lineCount, span.text.split("\n").length, 1);

  // For single-line blocks, clip to the dominant ink band so descenders don't
  // bleed into the next PDF text line and cause overlapping edit boxes.
  if (textLineCount <= 1) {
    const rowActive = new Array(height).fill(false);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (isForegroundPixel(data, i, bgLum, 18)) {
          rowActive[y] = true;
          break;
        }
      }
    }
    const bands: { y0: number; y1: number }[] = [];
    let bandStart = -1;
    for (let y = 0; y < height; y++) {
      if (rowActive[y] && bandStart < 0) bandStart = y;
      if ((!rowActive[y] || y === height - 1) && bandStart >= 0) {
        const end = rowActive[y] && y === height - 1 ? y : y - 1;
        bands.push({ y0: bandStart, y1: end });
        bandStart = -1;
      }
    }
    if (bands.length > 0) {
      const dominant = bands.reduce((best, b) =>
        b.y1 - b.y0 > best.y1 - best.y0 ? b : best
      );
      minY = dominant.y0;
      maxY = dominant.y1;
    }
  }

  const cLeft = left + minX;
  const cTop = top + minY;
  const cRight = left + maxX + 1;
  const cBottom = top + maxY + 1;

  const [inkPx1, inkPy1] = viewport.convertToPdfPoint(cLeft, cBottom) as [number, number];
  const [inkPx2, inkPy2] = viewport.convertToPdfPoint(cRight, cTop) as [number, number];

  const inkPx = Math.min(inkPx1, inkPx2);
  const inkPy = Math.min(inkPy1, inkPy2);
  const inkPw = Math.max(Math.abs(inkPx2 - inkPx1), 1);
  const inkPh = Math.max(Math.abs(inkPy2 - inkPy1), 1);

  const ascentRatio = span.ascentRatio ?? DEFAULT_ASCENT_RATIO;
  const descentRatio = span.descentRatio ?? DEFAULT_DESCENT_RATIO;
  const lineCount = textLineCount;

  // Anchor the edit box to canvas ink — avoids synthetic em boxes overlapping neighbours.
  const py = inkPy;
  const ph = inkPh;

  return {
    ...span,
    px: inkPx,
    py,
    pw: inkPw,
    ph,
    lineCount,
    baselineY: span.baselineY,
    ascentRatio,
    descentRatio,
    strokeScore,
    inkPx,
    inkPy,
    inkPw,
    inkPh,
    bold: span.bold,
    italic: span.italic,
    fontFamily: span.fontFamily,
    fontSize: span.fontSize,
  };
}

/**
 * Estimate the background color immediately around a PDF-space rectangle by
 * sampling the rendered page canvas just outside the box edges and taking the
 * brightest sample (background is typically lighter than glyphs).
 */
export function sampleBackgroundColor(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  rect: { px: number; py: number; pw: number; ph: number }
): string {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#ffffff";

  const [x1, y1] = viewport.convertToViewportPoint(rect.px, rect.py) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(rect.px + rect.pw, rect.py + rect.ph) as [
    number,
    number,
  ];
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const candidates: [number, number][] = [
    [left - 3, midY],
    [right + 3, midY],
    [midX, top - 3],
    [midX, bottom + 3],
    [left - 3, top - 3],
    [right + 3, bottom + 3],
  ];

  const samples: { brightness: number; r: number; g: number; b: number }[] = [];
  for (const [cx, cy] of candidates) {
    const px = Math.round(cx);
    const py = Math.round(cy);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const d = ctx.getImageData(px, py, 1, 1).data;
    const sample = { brightness: d[0] + d[1] + d[2], r: d[0], g: d[1], b: d[2] };
    samples.push(sample);
  }

  if (!samples.length) return "#ffffff";

  // Average non-ink edge samples — brightest-only picks white margins on colored backgrounds.
  const nonInk = samples.filter((s) => s.brightness > 72);
  const pool = nonInk.length > 0 ? nonInk : samples;
  const r = Math.round(pool.reduce((sum, s) => sum + s.r, 0) / pool.length);
  const g = Math.round(pool.reduce((sum, s) => sum + s.g, 0) / pool.length);
  const b = Math.round(pool.reduce((sum, s) => sum + s.b, 0) / pool.length);
  return rgbToHex(r, g, b);
}
