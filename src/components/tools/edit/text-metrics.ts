import type { PageViewport } from "pdfjs-dist";
import {
  fontFamilyCss,
  fontWeightCss,
  type FontFamily,
} from "@/lib/pdf";
import {
  DEFAULT_ASCENT_RATIO,
  DEFAULT_DESCENT_RATIO,
  PDF_LINE_HEIGHT,
} from "@/lib/pdf/edit-pickup";

/** Line height multiplier — fallback when box height is unknown. */
export const PREVIEW_LINE_HEIGHT = PDF_LINE_HEIGHT;

/** Convert PDF point size to CSS px at the current viewport scale. */
export function pdfFontSizeToPreviewPx(fontSizePt: number, viewportScale: number): number {
  return fontSizePt * viewportScale;
}

/** Convert CSS px back to PDF points. */
export function previewFontSizeToPdf(previewPx: number, viewportScale: number): number {
  return previewPx / viewportScale;
}

export interface TextMetrics {
  ascentRatio?: number;
  descentRatio?: number;
  lineCount?: number;
  /** Screen-space box height — used to derive per-line leading from actual PDF spacing. */
  boxHeightPx?: number;
}

export interface TextPreviewStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
}

/** Build overlay CSS typography that mirrors PDF export sizing. */
export function textPreviewStyle(
  fontSizePt: number,
  family: FontFamily,
  bold: boolean,
  italic: boolean,
  viewportScale: number,
  metrics?: TextMetrics
): TextPreviewStyle {
  const lineCount = Math.max(1, metrics?.lineCount ?? 1);
  const naturalSize = pdfFontSizeToPreviewPx(fontSizePt, viewportScale);

  const perLinePx =
    metrics?.boxHeightPx != null && metrics.boxHeightPx > 0
      ? metrics.boxHeightPx / lineCount
      : lineCount > 1
        ? fontSizePt * PDF_LINE_HEIGHT * viewportScale
        : fontSizePt *
          ((metrics?.ascentRatio ?? DEFAULT_ASCENT_RATIO) +
            (metrics?.descentRatio ?? DEFAULT_DESCENT_RATIO)) *
          viewportScale;

  // Never let font size exceed per-line height — that causes lines to collide.
  const fontSize = Math.min(naturalSize, perLinePx);
  const lineHeight = perLinePx;

  return {
    fontFamily: fontFamilyCss(family),
    fontSize,
    lineHeight,
    fontWeight: fontWeightCss(bold),
    fontStyle: italic ? "italic" : "normal",
  };
}

/**
 * Measure CSS px font size so text fits the on-screen box (width + height).
 * Only used for user-created boxes where auto-fit is desired — not imported PDF text.
 */
export function measurePreviewFontSize(
  text: string,
  family: FontFamily,
  bold: boolean,
  italic: boolean,
  maxWidthPx: number,
  maxHeightPx: number,
  lineCount = 1
): number {
  if (typeof document === "undefined") return 12;

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const perLineHeight = maxHeightPx / Math.max(lineCount, lines.length, 1);
  const byHeight = perLineHeight / PREVIEW_LINE_HEIGHT;

  const probe = document.createElement("span");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;visibility:hidden;white-space:nowrap;";
  probe.style.fontFamily = fontFamilyCss(family);
  probe.style.fontWeight = String(fontWeightCss(bold));
  probe.style.fontStyle = italic ? "italic" : "normal";
  document.body.appendChild(probe);

  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), lines[0] ?? "");
  let lo = 4;
  let hi = Math.max(byHeight * 2, 8);
  let byWidth = byHeight;

  if (longest && maxWidthPx > 0) {
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      probe.style.fontSize = `${mid}px`;
      probe.textContent = longest;
      if (probe.offsetWidth > maxWidthPx) hi = mid;
      else lo = mid;
    }
    byWidth = lo;
  }

  document.body.removeChild(probe);
  return Math.max(4, Math.min(byHeight, byWidth));
}

/** PDF leading between baselines derived from the stored box and line count. */
export function pdfLeadingFromBox(ph: number, lineCount: number, fontSize: number): number {
  if (lineCount <= 1) return fontSize * PDF_LINE_HEIGHT;
  return ph / lineCount;
}

/** Offset from overlay box top to first baseline (screen px). */
export function previewBaselineOffset(
  viewport: PageViewport,
  block: { bbox: { px: number; py: number }; baselineY?: number },
  box: { top: number },
  fontSizePx: number,
  ascentRatio = DEFAULT_ASCENT_RATIO
): number {
  const baselineY = block.baselineY ?? block.bbox.py;
  const [, baselineScreenY] = viewport.convertToViewportPoint(block.bbox.px, baselineY) as [
    number,
    number,
  ];
  return baselineScreenY - box.top - fontSizePx * ascentRatio;
}
