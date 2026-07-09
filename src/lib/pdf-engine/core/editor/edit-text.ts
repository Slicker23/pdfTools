/**
 * High-level in-place text editor (M5).
 *
 * `editText` rewrites the shown text of individual runs in a PDF and saves the
 * result as an incremental update, so untouched bytes stay byte-identical and
 * the original embedded fonts are reused. Each edit targets a run by its locator
 * (page + content-stream object number + byte offset), produced by the extractor.
 *
 * Runs that cannot be edited natively are reported in `skipped` (with a reason)
 * and left untouched, so a caller can fall back to an overlay for those.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { matchAscii } from "../bytes";
import { Lexer } from "../cos/lexer";
import { CosDocument } from "../document";
import { readStartXref } from "../xref/build";
import {
  asName,
  asNumber,
  isRef,
  isStream,
  cosDict,
  cosInt,
  dictGet,
  type CosArray,
  type CosDict,
  type CosObject,
  type CosRef,
} from "../cos/types";
import type { SpanSource, TextSpan } from "../content/types";
import {
  buildStyleAndShowReplacement,
  discoverTextBlockContext,
  effectiveVisualSize,
  styleChangeRequested,
} from "./edit-style";
import { matchPageFontRef, parseFontVariant } from "./font-embed";
import { buildShowReplacement, spliceStream, type StreamEdit } from "./edit-run";
import { writeIncrementalUpdate, type IncrementalObject } from "../writer/incremental";

/** Identifies one editable run within a document. */
export interface EditLocator {
  page: number;
  streamNum: number;
  regionStart: number;
}

export interface TextEdit {
  locator: EditLocator;
  /** New text for the run; empty string deletes the run's glyphs. */
  newText: string;
  /** Hex fill color (#rrggbb); applied natively when the run is in an isolated BT block. */
  newColor?: string;
  /** Target visual size (page space); rescales Tf/Tm in isolated BT blocks. */
  newSize?: number;
  /** Extract-time color/size — used to detect style edits vs the PDF span. */
  originalColor?: string;
  originalSize?: number;
  /** Target font family; swaps `/Font` resource when a page match exists (M9). */
  newFontFamily?: string;
  newBold?: boolean;
  newItalic?: boolean;
}

export type SkipReason =
  | "encrypted"
  | "recovered"
  | "not-found"
  | "not-editable"
  | "unencodable";

export interface EditResult {
  output: Uint8Array;
  applied: EditLocator[];
  skipped: { locator: EditLocator; reason: SkipReason }[];
}

/** Encode a locator as a stable, free-form block id (`p1:s4:o128`). */
export function encodeLocator(loc: EditLocator): string {
  return `p${loc.page}:s${loc.streamNum}:o${loc.regionStart}`;
}

/** Parse a locator id produced by {@link encodeLocator}; undefined if malformed. */
export function decodeLocator(id: string): EditLocator | undefined {
  const m = /^p(\d+):s(\d+):o(\d+)$/.exec(id);
  if (!m) return undefined;
  return { page: Number(m[1]), streamNum: Number(m[2]), regionStart: Number(m[3]) };
}

function locatorKey(streamNum: number, regionStart: number): string {
  return `${streamNum}:${regionStart}`;
}

/** True when the file's newest cross-reference section is an XRef stream. */
function newestXrefIsStream(bytes: Uint8Array): boolean {
  const offset = readStartXref(bytes);
  const probe = new Lexer(bytes, offset);
  probe.skipWhitespaceAndComments();
  return !matchAscii(bytes, probe.pos, "xref");
}

/** Text-space horizontal advance of a run of glyphs, given the run's text state. */
function naturalAdvance(span: TextSpan, glyphs: { width: number; isSpace: boolean }[]): number {
  const fontSize = span.fontSize;
  const th = span.hscale ?? 1;
  const tc = span.charSpacing ?? 0;
  const tw = span.wordSpacing ?? 0;
  let tx = 0;
  for (const g of glyphs) {
    tx += ((g.width / 1000) * fontSize + tc + (g.isSpace ? tw : 0)) * th;
  }
  return tx;
}

/** Build the modified (unfiltered) content-stream object for a set of splices. */
async function rebuildStream(
  doc: CosDocument,
  streamNum: number,
  edits: StreamEdit[]
): Promise<IncrementalObject | undefined> {
  const stream = doc.getObject(streamNum);
  if (!isStream(stream)) return undefined;
  const decoded = await doc.decodeStream(stream);
  const newDecoded = spliceStream(decoded, edits);

  const dict = cosDict(stream.dict.map);
  dict.map.delete("Filter");
  dict.map.delete("DecodeParms");
  dict.map.delete("DL");
  dict.map.set("Length", cosInt(newDecoded.length));

  const entry = doc.xrefEntry(streamNum);
  const gen = entry && entry.kind === "inuse" ? entry.gen : 0;
  return { num: streamNum, gen, obj: { type: "stream", dict, raw: newDecoded } };
}

/**
 * Apply in-place text edits to an already-open document. Returns the edited
 * bytes plus per-edit outcomes. Encrypted or recovered documents are left
 * untouched (all edits skipped), so callers can fall back to an overlay.
 */
export async function editText(
  doc: CosDocument,
  edits: TextEdit[],
  deflate?: DeflateFn
): Promise<EditResult> {
  const original = doc.bytes;
  const applied: EditLocator[] = [];
  const skipped: { locator: EditLocator; reason: SkipReason }[] = [];

  if (edits.length === 0) return { output: original.slice(), applied, skipped };

  const skipAll = (reason: SkipReason): EditResult => ({
    output: original.slice(),
    applied: [],
    skipped: edits.map((e) => ({ locator: e.locator, reason })),
  });

  // Editing an encrypted file would require re-encrypting the rewritten stream.
  if (doc.encrypted) return skipAll("encrypted");

  // A recovered file's own xref/`/Prev` chain is untrustworthy. We can still edit
  // it in place by writing a single self-contained xref (see `standalone` below),
  // but only when every recovered object is uncompressed (representable in a
  // classic xref). If any object lives in an object stream, decline.
  let baseOffsets: Map<number, { offset: number; gen: number }> | undefined;
  if (doc.recovered) {
    baseOffsets = new Map();
    for (const num of doc.objectNumbers()) {
      const entry = doc.xrefEntry(num);
      if (!entry || entry.kind !== "inuse") return skipAll("recovered");
      baseOffsets.set(num, { offset: entry.offset, gen: entry.gen });
    }
  }

  const rootRef = dictGet(doc.trailer, "Root");
  if (!isRef(rootRef)) return skipAll("not-found");

  // Group edits by page so each page is interpreted once.
  const byPage = new Map<number, TextEdit[]>();
  for (const e of edits) {
    const list = byPage.get(e.locator.page) ?? [];
    list.push(e);
    byPage.set(e.locator.page, list);
  }

  const pages = doc.pages();
  // streamNum -> pending splices.
  const streamEdits = new Map<number, StreamEdit[]>();

  for (const [pageNum, pageEdits] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) {
      for (const e of pageEdits) skipped.push({ locator: e.locator, reason: "not-found" });
      continue;
    }
    const { spans } = await doc.pageSpans(page);
    const index = new Map<string, TextSpan>();
    for (const span of spans) {
      if (span.source) index.set(locatorKey(span.source.streamNum, span.source.regionStart), span);
    }

    // Cache built fonts by dict identity within the page.
    const fontCache = new Map<CosObject, Awaited<ReturnType<CosDocument["buildFontForDict"]>>>();

    for (const e of pageEdits) {
      const span = index.get(locatorKey(e.locator.streamNum, e.locator.regionStart));
      if (!span || !span.source) {
        skipped.push({ locator: e.locator, reason: "not-found" });
        continue;
      }
      const fontDict = span.fontDict;
      if (!fontDict) {
        skipped.push({ locator: e.locator, reason: "not-editable" });
        continue;
      }
      let font = fontCache.get(fontDict);
      if (!font) {
        font = await doc.buildFontForDict(fontDict as CosDict);
        fontCache.set(fontDict, font);
      }
      if (!font.encode) {
        skipped.push({ locator: e.locator, reason: "not-editable" });
        continue;
      }

      if (span.renderMode !== 0) {
        skipped.push({ locator: e.locator, reason: "not-editable" });
        continue;
      }

      const baseFont = asName(dictGet(fontDict as CosDict, "BaseFont")) ?? "";
      const currentVariant = parseFontVariant(baseFont);
      const fontStyle = {
        family: e.newFontFamily,
        bold: e.newBold,
        italic: e.newItalic,
      };
      const wantsStyle = styleChangeRequested(span, e.newColor, e.newSize, fontStyle, {
        color: e.originalColor,
        size: e.originalSize,
      });
      let styleCtx: ReturnType<typeof discoverTextBlockContext> | undefined;
      let encodeFont = font;
      let newFontRef: string | undefined;

      if (wantsStyle) {
        const stream = doc.getObject(e.locator.streamNum);
        if (!isStream(stream)) {
          skipped.push({ locator: e.locator, reason: "not-editable" });
          continue;
        }
        const decoded = await doc.decodeStream(stream);
        styleCtx = discoverTextBlockContext(
          decoded,
          span.source.regionStart,
          span.source.regionEnd,
          span.fillColor
            ? {
                fillFallback: {
                  r: span.fillColor.r,
                  g: span.fillColor.g,
                  b: span.fillColor.b,
                },
              }
            : undefined
        );
        if (!styleCtx) {
          skipped.push({ locator: e.locator, reason: "not-editable" });
          continue;
        }

        const fontChanged =
          (e.newFontFamily !== undefined &&
            e.newFontFamily.toLowerCase() !== currentVariant.name.toLowerCase()) ||
          (e.newBold !== undefined && e.newBold !== currentVariant.bold) ||
          (e.newItalic !== undefined && e.newItalic !== currentVariant.italic);

        if (fontChanged) {
          const target = {
            name: e.newFontFamily ?? currentVariant.name,
            size: span.fontSize,
            bold: e.newBold ?? currentVariant.bold,
            italic: e.newItalic ?? currentVariant.italic,
            color: "#000000",
          };
          const matched = await matchPageFontRef(doc, page, target);
          if (!matched) {
            skipped.push({ locator: e.locator, reason: "not-editable" });
            continue;
          }
          const matchedFont = await doc.buildFontForDict(matched.fontDict);
          if (!matchedFont.encode) {
            skipped.push({ locator: e.locator, reason: "not-editable" });
            continue;
          }
          encodeFont = matchedFont;
          newFontRef = matched.fontRef;
        }
      }

      if (!encodeFont.encode) {
        skipped.push({ locator: e.locator, reason: "not-editable" });
        continue;
      }

      const enc = encodeFont.encode(e.newText);
      if (enc.unencodable.length > 0) {
        skipped.push({ locator: e.locator, reason: "unencodable" });
        continue;
      }

      // New run advance for compensation (keeps following content in place).
      const glyphs = encodeFont.decode(enc.bytes).map((g) => ({
        width: g.width,
        isSpace: g.bytes.length === 1 && g.code === 32,
      }));
      let advanceFontSize = span.fontSize;
      if (e.newSize !== undefined) {
        const oldVisual = effectiveVisualSize(span);
        if (oldVisual > 0) advanceFontSize = span.fontSize * (e.newSize / oldVisual);
      }
      const advanceSpan = { ...span, fontSize: advanceFontSize };
      const newTx = naturalAdvance(advanceSpan, glyphs);
      const oldTx = span.advanceTx ?? newTx;
      const denom = advanceFontSize * (span.hscale ?? 1);
      const comp = denom !== 0 ? ((newTx - oldTx) * 1000) / denom : 0;

      let replacement: Uint8Array;
      let regionStart = span.source.regionStart;
      let regionEnd = span.source.regionEnd;

      if (styleCtx) {
        const styled = buildStyleAndShowReplacement(
          styleCtx,
          span.source,
          span,
          enc.bytes,
          comp,
          { newColor: e.newColor, newSize: e.newSize, newFontRef }
        );
        if (!styled) {
          skipped.push({ locator: e.locator, reason: "not-editable" });
          continue;
        }
        replacement = styled;
        regionStart = styleCtx.prefixStart;
        regionEnd = styleCtx.showEnd;
      } else {
        replacement = buildShowReplacement(span.source as SpanSource, enc.bytes, comp);
      }

      const list = streamEdits.get(e.locator.streamNum) ?? [];
      list.push({
        regionStart,
        regionEnd,
        replacement,
      });
      streamEdits.set(e.locator.streamNum, list);
      applied.push(e.locator);
    }
  }

  if (streamEdits.size === 0) {
    return { output: original.slice(), applied, skipped };
  }

  const updates: IncrementalObject[] = [];
  for (const [streamNum, list] of streamEdits) {
    const obj = await rebuildStream(doc, streamNum, list);
    if (obj) updates.push(obj);
  }

  const size = asNumber(dictGet(doc.trailer, "Size")) ?? maxObjectNumber(doc) + 1;
  const idObj = dictGet(doc.trailer, "ID");
  const encryptRef = dictGet(doc.trailer, "Encrypt");

  const output = await writeIncrementalUpdate({
    original,
    updates,
    root: rootRef as CosRef,
    size,
    id: idObj && idObj.type === "array" ? (idObj as CosArray) : undefined,
    encrypt: isRef(encryptRef) ? encryptRef : undefined,
    // In standalone (recovered) mode the source xref chain is untrustworthy and
    // unused, so don't probe it (its `startxref` may be missing/broken).
    prevStartxref: baseOffsets ? 0 : readStartXref(original),
    useXrefStream: baseOffsets ? false : newestXrefIsStream(original),
    deflate,
    standalone: Boolean(baseOffsets),
    baseOffsets,
  });

  return { output, applied, skipped };
}

function maxObjectNumber(doc: CosDocument): number {
  let max = 0;
  for (const num of doc.objectNumbers()) if (num > max) max = num;
  return max;
}

/** Convenience: open `bytes`, apply edits, and return the edited document. */
export async function editTextBytes(
  bytes: Uint8Array,
  edits: TextEdit[],
  inflate: InflateFn,
  deflate?: DeflateFn
): Promise<EditResult> {
  const doc = await CosDocument.open(bytes, { inflate });
  return editText(doc, edits, deflate);
}
