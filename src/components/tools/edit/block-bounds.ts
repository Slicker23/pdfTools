import type { PageViewport } from "pdfjs-dist";
import type { PdfEditBBox, PdfEditTextBlock } from "@/lib/pdf/edit-model";
import {
  clampBlockToPage,
  contentDiffersFromOriginal,
  effectiveBlockBounds,
  translateBlockPosition,
  visualBlockBounds,
} from "@/lib/pdf/edit-geometry";
import type { BlockScreenBox } from "./block-view";

export {
  clampBlockToPage,
  contentDiffersFromOriginal,
  effectiveBlockBounds,
  translateBlockPosition,
  visualBlockBounds,
};

/** Padded cover rect from any PDF-space bounds. */
export function paddedCoverRect(rect: PdfEditBBox, pad = 1): PdfEditBBox {
  return {
    px: rect.px - pad,
    py: rect.py - pad,
    pw: rect.pw + pad * 2,
    ph: rect.ph + pad * 2,
  };
}

/** Padded cover rect for background sampling (preview whiteout). */
export function effectiveCoverRect(block: PdfEditTextBlock): PdfEditBBox {
  return paddedCoverRect(effectiveBlockBounds(block));
}

/** Bounds for overlays: grow with content edits, keep extract bbox on position-only moves. */
export function previewCoverRect(block: PdfEditTextBlock, contentEdited: boolean): PdfEditBBox {
  return paddedCoverRect(visualBlockBounds(block, contentEdited));
}

export function pdfRectToScreenBox(
  viewport: PageViewport,
  rect: PdfEditBBox
): BlockScreenBox {
  const [x1, y1] = viewport.convertToViewportPoint(rect.px, rect.py) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(rect.px + rect.pw, rect.py + rect.ph) as [
    number,
    number,
  ];
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.max(Math.abs(x2 - x1), 1),
    height: Math.max(Math.abs(y2 - y1), 1),
  };
}

/** Bounds used for selection overlays and hit-testing. */
export function interactionBounds(block: PdfEditTextBlock, contentEdited: boolean): PdfEditBBox {
  return visualBlockBounds(block, contentEdited);
}

export function blockToInteractionScreenBox(
  viewport: PageViewport,
  block: PdfEditTextBlock,
  contentEdited: boolean
): BlockScreenBox {
  return pdfRectToScreenBox(viewport, interactionBounds(block, contentEdited));
}

export function hitTestBlockAtPdfPoint(
  block: PdfEditTextBlock,
  pdfX: number,
  pdfY: number,
  contentEdited = false
): boolean {
  const b = interactionBounds(block, contentEdited);
  return pdfX >= b.px && pdfX <= b.px + b.pw && pdfY >= b.py && pdfY <= b.py + b.ph;
}

export function screenDeltaToPdfDelta(
  viewport: PageViewport,
  dxScreen: number,
  dyScreen: number
): { dx: number; dy: number } {
  const [x0, y0] = viewport.convertToPdfPoint(0, 0) as [number, number];
  const [x1, y1] = viewport.convertToPdfPoint(dxScreen, dyScreen) as [number, number];
  return { dx: x1 - x0, dy: y1 - y0 };
}
