/**
 * Native text relocation (M5): replace a located show operator with a new Tm
 * and show at the target position, preserving the span's embedded font and scale.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { asciiBytes, concatBytes, matchAscii } from "../bytes";
import { Lexer } from "../cos/lexer";
import { CosDocument } from "../document";
import { readStartXref } from "../xref/build";
import type { Matrix } from "../content/matrix";
import { invert, multiply } from "../content/matrix";
import {
  asNumber,
  cosDict,
  cosInt,
  dictGet,
  isRef,
  isStream,
  type CosArray,
  type CosDict,
  type CosObject,
  type CosRef,
} from "../cos/types";
import type { SpanSource, TextSpan } from "../content/types";
import { buildShowReplacement, spliceStream, type StreamEdit } from "./edit-run";
import { writeIncrementalUpdate, type IncrementalObject } from "../writer/incremental";
import type { EditLocator, SkipReason } from "./edit-text";

export interface TextMove {
  locator: EditLocator;
  /** Baseline x in PDF user space. */
  x: number;
  /** Baseline y in PDF user space. */
  y: number;
  text: string;
}

export interface MoveResult {
  output: Uint8Array;
  applied: EditLocator[];
  skipped: { locator: EditLocator; reason: SkipReason }[];
}

function locatorKey(streamNum: number, regionStart: number): string {
  return `${streamNum}:${regionStart}`;
}

function newestXrefIsStream(bytes: Uint8Array): boolean {
  const offset = readStartXref(bytes);
  const probe = new Lexer(bytes, offset);
  probe.skipWhitespaceAndComments();
  return !matchAscii(bytes, probe.pos, "xref");
}

function isHorizontalMatrix(m: Matrix): boolean {
  const [, b, c] = m;
  const eps = 0.02;
  return Math.abs(b) < eps && Math.abs(c) < eps;
}

function textScaleFromSpan(span: TextSpan): Matrix {
  const th = span.hscale ?? 1;
  return [span.fontSize * th, 0, 0, span.fontSize, 0, 0];
}

function buildRelocatedReplacement(
  span: TextSpan,
  source: SpanSource,
  encoded: Uint8Array,
  targetX: number,
  targetY: number,
  ctmAtShow: Matrix
): Uint8Array {
  const M_new: Matrix = [
    span.matrix[0],
    span.matrix[1],
    span.matrix[2],
    span.matrix[3],
    targetX,
    targetY,
  ];
  const T_glyph_new = multiply(M_new, invert(ctmAtShow));
  const tm_new = multiply(invert(textScaleFromSpan(span)), T_glyph_new);
  const [a, b, c, d, e, f] = tm_new;
  const tm = asciiBytes(
    `${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(2)} ${f.toFixed(2)} Tm\n`
  );
  const show = buildShowReplacement(source, encoded, 0);
  return concatBytes([tm, show]);
}

async function rebuildStreamWithChanges(
  doc: CosDocument,
  streamNum: number,
  splices: StreamEdit[]
): Promise<IncrementalObject | undefined> {
  const stream = doc.getObject(streamNum);
  if (!isStream(stream)) return undefined;
  let decoded = await doc.decodeStream(stream);
  if (splices.length) decoded = spliceStream(decoded, splices);
  const dict = cosDict(stream.dict.map);
  dict.map.delete("Filter");
  dict.map.delete("DecodeParms");
  dict.map.delete("DL");
  dict.map.set("Length", cosInt(decoded.length));
  const entry = doc.xrefEntry(streamNum);
  const gen = entry && entry.kind === "inuse" ? entry.gen : 0;
  return { num: streamNum, gen, obj: { type: "stream", dict, raw: decoded } };
}

function maxObjectNumber(doc: CosDocument): number {
  let max = 0;
  for (const num of doc.objectNumbers()) if (num > max) max = num;
  return max;
}

/**
 * Relocate editable text runs by stripping the old show operator and appending
 * a new absolute-position run with the same embedded font.
 */
export async function relocateTextRuns(
  doc: CosDocument,
  moves: TextMove[],
  deflate?: DeflateFn
): Promise<MoveResult> {
  const original = doc.bytes;
  const applied: EditLocator[] = [];
  const skipped: { locator: EditLocator; reason: SkipReason }[] = [];

  if (moves.length === 0) return { output: original.slice(), applied, skipped };

  const skipAll = (reason: SkipReason): MoveResult => ({
    output: original.slice(),
    applied: [],
    skipped: moves.map((m) => ({ locator: m.locator, reason })),
  });

  if (doc.encrypted) return skipAll("encrypted");

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

  const byPage = new Map<number, TextMove[]>();
  for (const m of moves) {
    const list = byPage.get(m.locator.page) ?? [];
    list.push(m);
    byPage.set(m.locator.page, list);
  }

  const streamSplices = new Map<number, StreamEdit[]>();
  const pages = doc.pages();

  for (const [pageNum, pageMoves] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) {
      for (const m of pageMoves) skipped.push({ locator: m.locator, reason: "not-found" });
      continue;
    }

    const { spans } = await doc.pageSpans(page);
    const index = new Map<string, TextSpan>();
    for (const span of spans) {
      if (span.source) index.set(locatorKey(span.source.streamNum, span.source.regionStart), span);
    }

    const fontCache = new Map<CosObject, Awaited<ReturnType<CosDocument["buildFontForDict"]>>>();

    for (const m of pageMoves) {
      const span = index.get(locatorKey(m.locator.streamNum, m.locator.regionStart));
      if (!span?.source) {
        skipped.push({ locator: m.locator, reason: "not-found" });
        continue;
      }
      if (m.text.includes("\n")) {
        skipped.push({ locator: m.locator, reason: "not-editable" });
        continue;
      }
      if (!isHorizontalMatrix(span.matrix)) {
        skipped.push({ locator: m.locator, reason: "not-editable" });
        continue;
      }

      const fontDict = span.fontDict;
      if (!fontDict) {
        skipped.push({ locator: m.locator, reason: "not-editable" });
        continue;
      }

      let font = fontCache.get(fontDict);
      if (!font) {
        font = await doc.buildFontForDict(fontDict as CosDict);
        fontCache.set(fontDict, font);
      }
      if (!font.encode) {
        skipped.push({ locator: m.locator, reason: "not-editable" });
        continue;
      }

      const enc = font.encode(m.text);
      if (enc.unencodable.length > 0) {
        skipped.push({ locator: m.locator, reason: "unencodable" });
        continue;
      }

      const source = span.source as SpanSource;
      let ctmAtShow: Matrix;
      try {
        ctmAtShow = await doc.streamContentStateAt(page, m.locator.streamNum, source.regionStart);
      } catch {
        skipped.push({ locator: m.locator, reason: "not-editable" });
        continue;
      }

      const replacement = buildRelocatedReplacement(span, source, enc.bytes, m.x, m.y, ctmAtShow);
      const splices = streamSplices.get(m.locator.streamNum) ?? [];
      splices.push({
        regionStart: source.regionStart,
        regionEnd: source.regionEnd,
        replacement,
      });
      streamSplices.set(m.locator.streamNum, splices);
      applied.push(m.locator);
    }
  }

  const touchedStreams = streamSplices.keys();
  if (streamSplices.size === 0) {
    return { output: original.slice(), applied, skipped };
  }

  const updates: IncrementalObject[] = [];
  for (const streamNum of touchedStreams) {
    const obj = await rebuildStreamWithChanges(
      doc,
      streamNum,
      streamSplices.get(streamNum) ?? []
    );
    if (obj) updates.push(obj);
  }

  if (updates.length === 0) {
    return { output: original.slice(), applied: [], skipped: moves.map((m) => ({ locator: m.locator, reason: "not-found" })) };
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
    prevStartxref: baseOffsets ? 0 : readStartXref(original),
    useXrefStream: baseOffsets ? false : newestXrefIsStream(original),
    deflate,
    standalone: Boolean(baseOffsets),
    baseOffsets,
  });

  return { output, applied, skipped };
}

/** Convenience: open bytes, relocate runs, return edited document. */
export async function relocateTextRunsBytes(
  bytes: Uint8Array,
  moves: TextMove[],
  inflate: InflateFn,
  deflate?: DeflateFn
): Promise<MoveResult> {
  const doc = await CosDocument.open(bytes, { inflate });
  return relocateTextRuns(doc, moves, deflate);
}
