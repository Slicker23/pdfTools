import type { PdfEditBBox, PdfEditFont, PdfEditTextBlock } from "./edit-model";

/** Minimum inset from the page right edge when wrapping text. */
export const PAGE_TEXT_MARGIN = 12;

/** PDF leading between baselines (matches overlay apply). */
export const TEXT_LINE_HEIGHT = 1.2;

export type TextWidthMeasure = (text: string) => number;

function charWidthRatio(font: PdfEditFont): number {
  if (/courier|mono/i.test(font.name)) return 0.6;
  return font.bold ? 0.58 : 0.55;
}

/** Heuristic text width in PDF points (no font program required). */
export function estimateTextWidth(text: string, font: PdfEditFont): number {
  if (!text) return 0;
  return text.length * font.size * charWidthRatio(font);
}

export function defaultTextWidthMeasure(font: PdfEditFont): TextWidthMeasure {
  return (text) => estimateTextWidth(text, font);
}

/** Max line width for a block anchored at `blockPx` within a page. */
export function maxTextWidthForBlock(
  blockPx: number,
  columnWidth: number,
  pageW: number,
  margin = PAGE_TEXT_MARGIN
): number {
  const available = Math.max(24, pageW - margin - blockPx);
  const column = columnWidth > 0 ? columnWidth : available;
  return Math.min(column, available);
}

function breakLongWord(
  word: string,
  maxWidth: number,
  measure: TextWidthMeasure
): string[] {
  const lines: string[] = [];
  let chunk = "";
  for (const ch of word) {
    const candidate = chunk + ch;
    if (measure(candidate) > maxWidth && chunk) {
      lines.push(chunk);
      chunk = ch;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) lines.push(chunk);
  return lines.length ? lines : [""];
}

/** Word-wrap one paragraph to fit `maxWidth` (points). */
export function wrapParagraph(
  text: string,
  maxWidth: number,
  measure: TextWidthMeasure
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [""];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    const parts = breakLongWord(word, maxWidth, measure);
    lines.push(...parts.slice(0, -1));
    line = parts[parts.length - 1] ?? "";
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Layout plain text into lines respecting explicit newlines and max width. */
export function layoutTextLines(
  text: string,
  font: PdfEditFont,
  pageW: number,
  blockPx: number,
  columnWidth: number,
  measure: TextWidthMeasure = defaultTextWidthMeasure(font)
): string[] {
  const maxWidth = maxTextWidthForBlock(blockPx, columnWidth, pageW);
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph && paragraphs.length > 1) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(paragraph, maxWidth, measure));
  }

  return lines.length ? lines : [""];
}

export interface TextLayoutResult {
  text: string;
  lines: string[];
  lineCount: number;
  bbox: PdfEditBBox;
  baselineY: number;
}

/** Compute wrapped lines and a page-fitting bbox for a text block. */
export function layoutBlockForPage(
  block: PdfEditTextBlock,
  pageW: number,
  measure: TextWidthMeasure = defaultTextWidthMeasure(block.font)
): TextLayoutResult {
  const font = block.font;
  const lineHeight = font.size * TEXT_LINE_HEIGHT;
  const lines = layoutTextLines(
    block.text,
    font,
    pageW,
    block.bbox.px,
    block.bbox.pw,
    measure
  );
  const lineCount = Math.max(lines.length, 1);
  const pw = Math.max(
    ...lines.map((line) => (line ? measure(line) : 0)),
    12
  );
  const ph = Math.max(lineCount * lineHeight, font.size * 0.85);
  const baselineY = block.baselineY ?? block.bbox.py + font.size * 0.2;
  const py = baselineY - (lineCount - 1) * lineHeight - font.size * 0.2;

  return {
    text: lines.join("\n"),
    lines,
    lineCount,
    bbox: { px: block.bbox.px, py, pw, ph },
    baselineY,
  };
}

/** Apply wrap layout and keep the block inside page bounds (position only). */
export function layoutBlockWithinPage(
  block: PdfEditTextBlock,
  pageW: number,
  pageH: number,
  measure?: TextWidthMeasure
): PdfEditTextBlock {
  if (block.deleted || !block.text.trim()) return block;

  const laid = layoutBlockForPage(block, pageW, measure);
  let next: PdfEditTextBlock = {
    ...block,
    text: laid.text,
    lineCount: laid.lineCount,
    bbox: laid.bbox,
    baselineY: laid.baselineY,
  };

  const bounds = laid.bbox;
  let dx = 0;
  let dy = 0;
  if (bounds.px < 0) dx = -bounds.px;
  if (bounds.py < 0) dy = -bounds.py;
  if (bounds.px + bounds.pw > pageW) dx = pageW - (bounds.px + bounds.pw);
  if (bounds.py + bounds.ph > pageH) dy = pageH - (bounds.py + bounds.ph);

  if (dx !== 0 || dy !== 0) {
    next = {
      ...next,
      bbox: {
        ...next.bbox,
        px: next.bbox.px + dx,
        py: next.bbox.py + dy,
      },
      baselineY: (next.baselineY ?? next.bbox.py) + dy,
      insertAt: next.insertAt
        ? { px: next.insertAt.px + dx, py: next.insertAt.py + dy }
        : undefined,
    };
  }

  return next;
}
