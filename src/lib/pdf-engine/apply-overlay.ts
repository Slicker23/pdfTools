/**
 * pdf-lib overlay apply (whiteout + redraw). Platform hooks for bg sampling and fonts.
 */
import { PDFDocument, rgb, type PDFPage, type PDFFont, type RGB } from "pdf-lib";
import {
  nearestFontFamily,
  resolveFont,
  type FontFamily,
} from "../pdf/fonts";
import type { PdfEditBBox, PdfEditBlockPatch } from "../pdf/edit-model";
import {
  layoutTextLines,
  TEXT_LINE_HEIGHT,
} from "../pdf/text-layout";
import {
  CosDocument,
  decodeLocator,
  editText,
  type TextEdit,
} from "./core";
import type { PlatformAdapters } from "./core/platform";

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

export interface OverlayPlatform {
  sampleBgRgb(
    input: Uint8Array,
    pageIdx: number,
    bbox: PdfEditBBox,
    pageHeight: number,
    blockId?: string
  ): Promise<Rgb01>;
  loadUnicodeFont(pdfDoc: PDFDocument): Promise<PDFFont>;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function needsUnicodeFont(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 255) return true;
  }
  return false;
}

/** True when block text still matches per-glyph segment layout (move/style overlay). */
export function segmentLayoutMatches(block: PdfEditBlockPatch): boolean {
  if (!block.segments || block.segments.length <= 1) return false;
  const raw = block.segments.map((s) => s.text).join("");
  return raw === (block.text ?? "").replace(/\s+/g, "");
}

async function drawSegmentGlyphs(
  page: PDFPage,
  block: PdfEditBlockPatch,
  font: PDFFont,
  color: RGB
): Promise<void> {
  const bbox = block.bbox!;
  const size = block.font!.size;
  const baselineOffset = (block.baselineY ?? bbox.py) - bbox.py;

  for (const seg of block.segments!) {
    if (!seg.text) continue;
    page.drawText(seg.text, {
      x: seg.bbox.px,
      y: seg.bbox.py + baselineOffset,
      size,
      font,
      color,
    });
  }
}

async function drawCoverRect(
  page: PDFPage,
  input: Uint8Array,
  pageIdx: number,
  pageHeight: number,
  rect: PdfEditBBox,
  platform: OverlayPlatform,
  blockId: string | undefined,
  pad = 1
): Promise<void> {
  const bg = await platform.sampleBgRgb(input, pageIdx, rect, pageHeight, blockId);
  page.drawRectangle({
    x: rect.px - pad,
    y: rect.py - pad,
    width: rect.pw + pad * 2,
    height: rect.ph + pad * 2,
    color: rgb(bg.r, bg.g, bg.b),
  });
}

async function drawBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  input: Uint8Array,
  pageIdx: number,
  pageHeight: number,
  block: PdfEditBlockPatch,
  platform: OverlayPlatform
): Promise<void> {
  const bbox = block.bbox;
  if (!bbox) return;

  const pad = 1;
  const text = block.text ?? "";

  if (block.deleted) {
    if (block.segments?.length) {
      for (const seg of block.segments) {
        await drawCoverRect(
          page,
          input,
          pageIdx,
          pageHeight,
          seg.bbox,
          platform,
          block.id,
          pad
        );
      }
    }
    if (block.originalBbox) {
      await drawCoverRect(
        page,
        input,
        pageIdx,
        pageHeight,
        block.originalBbox,
        platform,
        block.id,
        pad
      );
    }
    await drawCoverRect(page, input, pageIdx, pageHeight, bbox, platform, block.id, pad);
    return;
  }

  if (!text.trim() || !block.font) return;

  if (block.originalBbox) {
    await drawCoverRect(
      page,
      input,
      pageIdx,
      pageHeight,
      block.originalBbox,
      platform,
      block.id,
      pad
    );
  }

  const family = nearestFontFamily(block.font.name) as FontFamily;
  const drawBySegments = segmentLayoutMatches(block);
  const fontText = drawBySegments
    ? block.segments!.map((s) => s.text).join("")
    : text;
  const font = needsUnicodeFont(fontText)
    ? await platform.loadUnicodeFont(pdfDoc)
    : await resolveFont(pdfDoc, family, block.font.bold, block.font.italic);

  const color = hexToRgb(block.font.color);

  if (drawBySegments) {
    await drawSegmentGlyphs(page, block, font, color);
    return;
  }

  const pageW = page.getWidth();
  const size = block.font.size;
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const measure = (line: string) => font.widthOfTextAtSize(line, size);
  const lines = layoutTextLines(text, block.font, pageW, bbox.px, bbox.pw, measure);

  let maxLineWidth = 0;
  for (const line of lines) {
    if (line) maxLineWidth = Math.max(maxLineWidth, measure(line));
  }

  const lineCount = Math.max(lines.filter(Boolean).length, 1);
  const contentHeight = lineCount * lineHeight;
  const expandWidth = maxLineWidth > bbox.pw + 2;
  const coverW = (expandWidth ? Math.max(bbox.pw, maxLineWidth) : bbox.pw) + pad * 2;
  const coverH = Math.max(bbox.ph, contentHeight) + pad * 2;

  if (!block.originalBbox && !block.created) {
    await drawCoverRect(
      page,
      input,
      pageIdx,
      pageHeight,
      { px: bbox.px, py: bbox.py, pw: coverW - pad * 2, ph: coverH - pad * 2 },
      platform,
      block.id,
      pad
    );
  }

  let y = block.baselineY ?? bbox.py + (lines.length - 1) * lineHeight;

  for (const line of lines) {
    if (!line) {
      y -= lineHeight;
      continue;
    }
    page.drawText(line, {
      x: bbox.px,
      y,
      size,
      font,
      color,
    });
    y -= lineHeight;
  }
}

/** Overlay-based apply (pdf-lib): whiteout + redraw. */
export async function applyOverlayPatch(
  input: Uint8Array,
  blocks: PdfEditBlockPatch[],
  platform: OverlayPlatform
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: true });
  for (const block of blocks) {
    const pageIdx = (block.page ?? 1) - 1;
    if (pageIdx < 0 || pageIdx >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIdx);
    await drawBlock(pdfDoc, page, input, pageIdx, page.getHeight(), block, platform);
  }
  const bytes = await pdfDoc.save();
  return new Uint8Array(bytes);
}

function stripEditsForBlock(block: PdfEditBlockPatch): TextEdit[] {
  const edits: TextEdit[] = [];
  const seen = new Set<string>();
  const add = (locatorStr: string) => {
    if (seen.has(locatorStr)) return;
    const locator = decodeLocator(locatorStr);
    if (!locator) return;
    seen.add(locatorStr);
    edits.push({ locator, newText: "" });
  };
  if (block.segments?.length) {
    for (const seg of block.segments) add(seg.locator);
  } else if (block.locator) {
    add(block.locator);
  }
  return edits;
}

function blockHasStripTarget(block: PdfEditBlockPatch): boolean {
  if (block.segments?.length) return true;
  return Boolean(block.locator && decodeLocator(block.locator));
}

/**
 * Overlay fallback that first strips original glyphs natively (when a locator
 * exists), then redraws with pdf-lib.
 */
export async function applyOverlayWithNativeStrip(
  input: Uint8Array,
  blocks: PdfEditBlockPatch[],
  platform: OverlayPlatform,
  adapters: PlatformAdapters
): Promise<Uint8Array> {
  const locatable = blocks.filter((b) => blockHasStripTarget(b));
  const noLocator = blocks.filter((b) => !blockHasStripTarget(b));

  let bytes = input;

  if (locatable.length) {
    try {
      const doc = await CosDocument.open(bytes, { inflate: adapters.inflate });
      if (!doc.encrypted) {
        const stripEdits: TextEdit[] = locatable.flatMap(stripEditsForBlock);
        const stripResult = await editText(doc, stripEdits, adapters.deflate);
        bytes = stripResult.output;

        const redraw = locatable.filter(
          (b) => !b.deleted && (b.text ?? "").trim().length > 0
        );
        if (redraw.length) {
          bytes = await applyOverlayPatch(bytes, redraw, platform);
        }

        if (noLocator.length) {
          bytes = await applyOverlayPatch(bytes, noLocator, platform);
        }
        return bytes;
      }
    } catch {
      // Fall through to plain overlay on all blocks.
    }
  }

  return applyOverlayPatch(bytes, blocks, platform);
}
