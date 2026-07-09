import { randomUUID } from "crypto";
import {
  CosDocument,
  asName,
  dictGet,
  encodeLocator,
  isDict,
  type TextSpan,
} from "./core";
import { nodeAdapters } from "./node/platform-node";
import { createDejaVuOutlineReader } from "./node/dejavu-fonts";
import {
  EDIT_MODEL_VERSION,
  type PdfEditDocument,
  type PdfEditTextBlock,
} from "../pdf/edit-model";
import { parseFontName, rgbaToHex } from "./extract-helpers";
import { collectEncodableChars } from "./encodable";
import {
  groupMergeableSpans,
  mergedSpanBbox,
  mergedSpanText,
} from "./merge-text-spans";

/** Effective visual font size from the run's text rendering matrix. */
function effectiveSize(span: TextSpan): number {
  const size = Math.hypot(span.matrix[2], span.matrix[3]);
  return size > 0 ? size : span.fontSize || 12;
}

async function blockFromSpan(
  doc: CosDocument,
  span: TextSpan,
  page: number
): Promise<PdfEditTextBlock | undefined> {
  if (!span.source) return undefined;
  const bbox = span.bbox;
  if (!bbox) return undefined;
  const text = span.text ?? "";
  if (!text.trim()) return undefined;

  const baseFont = asName(dictGet(span.fontDict, "BaseFont")) ?? "Helvetica";
  const parsed = parseFontName(baseFont);
  const color = span.fillColor
    ? rgbaToHex(span.fillColor.r, span.fillColor.g, span.fillColor.b)
    : "#111111";
  const locator = encodeLocator({
    page,
    streamNum: span.source.streamNum,
    regionStart: span.source.regionStart,
  });

  let encodableChars: string | undefined;
  let supportsOutlines = false;
  if (span.fontDict && isDict(span.fontDict)) {
    try {
      const font = await doc.buildFontForDict(span.fontDict);
      const chars = collectEncodableChars(font, text);
      if (chars) encodableChars = chars;
      const outlineFont = await doc.buildOutlineFontForDict(span.fontDict);
      supportsOutlines = outlineFont.hasOutlines;
    } catch {
      // Non-fatal: overlay prediction falls back to server-side skip.
    }
  }

  return {
    id: locator,
    page,
    text,
    bbox: {
      px: bbox[0],
      py: bbox[1],
      pw: Math.max(bbox[2] - bbox[0], 1),
      ph: Math.max(bbox[3] - bbox[1], 1),
    },
    font: {
      name: parsed.name,
      size: effectiveSize(span),
      bold: parsed.bold,
      italic: parsed.italic,
      color,
      embeddedFontRef: span.fontRef,
    },
    lineCount: Math.max(1, text.split("\n").length),
    baselineY: span.origin.y,
    insertAt: { px: span.origin.x, py: span.origin.y },
    locator,
    encodableChars,
    supportsOutlines,
  };
}

async function blockFromSpanGroup(
  doc: CosDocument,
  spans: TextSpan[],
  page: number
): Promise<PdfEditTextBlock | undefined> {
  if (!spans.length) return undefined;
  if (spans.length === 1) return blockFromSpan(doc, spans[0]!, page);

  const lead = spans[0]!;
  const text = mergedSpanText(spans);
  if (!text.trim()) return undefined;
  const union = mergedSpanBbox(spans);

  const baseFont = asName(dictGet(lead.fontDict, "BaseFont")) ?? "Helvetica";
  const parsed = parseFontName(baseFont);
  const color = lead.fillColor
    ? rgbaToHex(lead.fillColor.r, lead.fillColor.g, lead.fillColor.b)
    : "#111111";
  const locator = encodeLocator({
    page,
    streamNum: lead.source!.streamNum,
    regionStart: lead.source!.regionStart,
  });

  const segments: PdfEditTextBlock["segments"] = [];
  for (const span of spans) {
    if (!span.source || !span.bbox) continue;
    segments.push({
      locator: encodeLocator({
        page,
        streamNum: span.source.streamNum,
        regionStart: span.source.regionStart,
      }),
      text: span.text ?? "",
      bbox: {
        px: span.bbox[0],
        py: span.bbox[1],
        pw: Math.max(span.bbox[2] - span.bbox[0], 1),
        ph: Math.max(span.bbox[3] - span.bbox[1], 1),
      },
    });
  }
  if (segments.length <= 1) return blockFromSpan(doc, lead, page);

  let encodableChars: string | undefined;
  let supportsOutlines = false;
  if (lead.fontDict && isDict(lead.fontDict)) {
    try {
      const font = await doc.buildFontForDict(lead.fontDict);
      const chars = collectEncodableChars(font, text);
      if (chars) encodableChars = chars;
      const outlineFont = await doc.buildOutlineFontForDict(lead.fontDict);
      supportsOutlines = outlineFont.hasOutlines;
    } catch {
      // Non-fatal.
    }
  }

  return {
    id: locator,
    page,
    text,
    bbox: {
      px: union[0],
      py: union[1],
      pw: Math.max(union[2] - union[0], 1),
      ph: Math.max(union[3] - union[1], 1),
    },
    font: {
      name: parsed.name,
      size: effectiveSize(lead),
      bold: parsed.bold,
      italic: parsed.italic,
      color,
      embeddedFontRef: lead.fontRef,
    },
    lineCount: Math.max(1, text.split("\n").length),
    baselineY: lead.origin.y,
    insertAt: { px: union[0], py: lead.origin.y },
    locator,
    encodableChars,
    supportsOutlines,
    segments,
  };
}

/**
 * Extract a PDF into the editable document model using the from-scratch engine
 * (M5). Adjacent same-line show operators with matching style are merged into
 * one block; each block's `locator` pins the primary run for native apply, and
 * `segments` lists every merged run when a phrase was split in the PDF.
 */
export async function extractDocument(input: Buffer): Promise<PdfEditDocument> {
  const doc = await CosDocument.open(new Uint8Array(input), {
    inflate: nodeAdapters.inflate,
    bundledOutlineFont: createDejaVuOutlineReader(),
  });
  const documentId = `doc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const pages = [];
  const pageNodes = doc.pages();
  for (let i = 0; i < pageNodes.length; i++) {
    const pn = pageNodes[i]!;
    const { spans } = await doc.pageSpans(pn);
    const blocks: PdfEditTextBlock[] = [];
    for (const group of groupMergeableSpans(spans)) {
      const block = await blockFromSpanGroup(doc, group, i + 1);
      if (block) blocks.push(block);
    }
    pages.push({ number: i + 1, width: pn.width, height: pn.height, blocks });
  }

  return { version: EDIT_MODEL_VERSION, documentId, pages };
}
