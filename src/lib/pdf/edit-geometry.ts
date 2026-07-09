import type { PdfEditBBox, PdfEditFont, PdfEditTextBlock } from "./edit-model";
import {
  estimateTextWidth,
  layoutBlockForPage,
  TEXT_LINE_HEIGHT,
} from "./text-layout";

function fontDiffers(a: PdfEditFont, b: PdfEditFont): boolean {
  return (
    a.name !== b.name ||
    a.size !== b.size ||
    Boolean(a.bold) !== Boolean(b.bold) ||
    Boolean(a.italic) !== Boolean(b.italic) ||
    a.color !== b.color
  );
}

/** True when text or font style changed (not position-only). */
export function contentDiffersFromOriginal(
  block: PdfEditTextBlock,
  original?: { text: string; font: PdfEditFont }
): boolean {
  if (block.created) return true;
  if (!original) return false;
  if (block.text !== original.text) return true;
  return fontDiffers(original.font, block.font);
}

export function effectiveBlockBounds(
  block: PdfEditTextBlock,
  page?: { width: number; height: number }
): PdfEditBBox {
  const b = block.bbox;
  if (block.deleted || !block.text.trim()) return b;
  if (page) return layoutBlockForPage(block, page.width).bbox;

  const lines = block.text.split("\n");
  const lineCount = Math.max(lines.filter(Boolean).length, 1);
  const contentH = lineCount * block.font.size * TEXT_LINE_HEIGHT;
  const longest = lines.reduce((a, line) => (line.length > a.length ? line : a), "");
  const contentW =
    longest.length > 0 ? estimateTextWidth(longest, block.font) : b.pw;

  return {
    px: b.px,
    py: b.py,
    pw: Math.max(contentW, 12),
    ph: Math.max(contentH, block.font.size * 0.85),
  };
}

export function visualBlockBounds(
  block: PdfEditTextBlock,
  contentEdited: boolean,
  page?: { width: number; height: number }
): PdfEditBBox {
  if (contentEdited) return effectiveBlockBounds(block, page);
  return block.bbox;
}

export function translateBlockPosition(
  block: PdfEditTextBlock,
  deltaPx: number,
  deltaPy: number
): Pick<PdfEditTextBlock, "bbox" | "baselineY" | "insertAt" | "segments"> {
  const bbox = {
    ...block.bbox,
    px: block.bbox.px + deltaPx,
    py: block.bbox.py + deltaPy,
  };
  const baselineY = (block.baselineY ?? block.bbox.py) + deltaPy;
  const insertAt = block.insertAt
    ? { px: block.insertAt.px + deltaPx, py: block.insertAt.py + deltaPy }
    : undefined;
  const segments = block.segments?.map((seg) => ({
    ...seg,
    bbox: {
      ...seg.bbox,
      px: seg.bbox.px + deltaPx,
      py: seg.bbox.py + deltaPy,
    },
  }));
  return { bbox, baselineY, insertAt, segments };
}

export function clampBlockToPage(
  block: PdfEditTextBlock,
  pageW: number,
  pageH: number,
  contentEdited = false
): PdfEditTextBlock {
  const bounds = visualBlockBounds(block, contentEdited, { width: pageW, height: pageH });
  let dx = 0;
  let dy = 0;
  if (bounds.px < 0) dx = -bounds.px;
  if (bounds.py < 0) dy = -bounds.py;
  if (bounds.px + bounds.pw > pageW) dx = pageW - (bounds.px + bounds.pw);
  if (bounds.py + bounds.ph > pageH) dy = pageH - (bounds.py + bounds.ph);
  if (dx === 0 && dy === 0) return block;
  return { ...block, ...translateBlockPosition(block, dx, dy) };
}
