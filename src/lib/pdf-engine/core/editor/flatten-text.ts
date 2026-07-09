/**
 * Flatten text runs to vector paths (M6).
 *
 * Replaces a located show operator with filled path operators built from the
 * embedded font's glyph outlines.
 */
import type { DeflateFn, InflateFn } from "../platform";
import { asciiBytes, concatBytes, matchAscii } from "../bytes";
import { Lexer } from "../cos/lexer";
import { CosDocument } from "../document";
import { readStartXref } from "../xref/build";
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
import type { TextSpan } from "../content/types";
import { buildShowReplacement, spliceStream, type StreamEdit } from "./edit-run";
import { discoverTextBlockByteRange } from "./edit-style";
import { writeIncrementalUpdate, type IncrementalObject } from "../writer/incremental";
import type { EditLocator, SkipReason } from "./edit-text";
import type { OutlineFont } from "../fonts/outline-font";
import { spanToPathContent } from "./text-to-path";

export interface TextFlatten {
  locator: EditLocator;
}

export interface FlattenResult {
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

function maxObjectNumber(doc: CosDocument): number {
  let max = 0;
  for (const num of doc.objectNumbers()) if (num > max) max = num;
  return max;
}

export async function flattenTextRuns(
  doc: CosDocument,
  flattens: TextFlatten[],
  deflate?: DeflateFn
): Promise<FlattenResult> {
  const original = doc.bytes;
  const applied: EditLocator[] = [];
  const skipped: { locator: EditLocator; reason: SkipReason }[] = [];

  if (flattens.length === 0) return { output: original.slice(), applied, skipped };

  const skipAll = (reason: SkipReason): FlattenResult => ({
    output: original.slice(),
    applied: [],
    skipped: flattens.map((f) => ({ locator: f.locator, reason })),
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

  const byPage = new Map<number, TextFlatten[]>();
  for (const f of flattens) {
    const list = byPage.get(f.locator.page) ?? [];
    list.push(f);
    byPage.set(f.locator.page, list);
  }

  const streamUpdates = new Map<number, Uint8Array>();
  const pages = doc.pages();

  for (const [pageNum, pageFlattens] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) {
      for (const f of pageFlattens) skipped.push({ locator: f.locator, reason: "not-found" });
      continue;
    }

    const { spans } = await doc.pageSpans(page);
    const index = new Map<string, TextSpan>();
    for (const span of spans) {
      if (span.source) index.set(locatorKey(span.source.streamNum, span.source.regionStart), span);
    }

    const fontCache = new Map<CosObject, OutlineFont>();

    for (const f of pageFlattens) {
      const span = index.get(locatorKey(f.locator.streamNum, f.locator.regionStart));
      if (!span?.source) {
        skipped.push({ locator: f.locator, reason: "not-found" });
        continue;
      }

      const fontDict = span.fontDict;
      if (!fontDict || fontDict.type !== "dict") {
        skipped.push({ locator: f.locator, reason: "not-editable" });
        continue;
      }

      let outlineFont = fontCache.get(fontDict);
      if (!outlineFont) {
        outlineFont = await doc.buildOutlineFontForDict(fontDict as CosDict);
        fontCache.set(fontDict, outlineFont);
      }

      if (!outlineFont.hasOutlines) {
        skipped.push({ locator: f.locator, reason: "not-editable" });
        continue;
      }

      const pathContent = spanToPathContent(span, outlineFont);
      if (!pathContent) {
        skipped.push({ locator: f.locator, reason: "not-editable" });
        continue;
      }

      const source = span.source;
      const streamNum = f.locator.streamNum;
      let decoded = streamUpdates.get(streamNum);
      if (!decoded) {
        const stream = doc.getObject(streamNum);
        if (!isStream(stream)) {
          skipped.push({ locator: f.locator, reason: "not-found" });
          continue;
        }
        decoded = await doc.decodeStream(stream);
      }

      const blockRange = discoverTextBlockByteRange(
        decoded,
        source.regionStart,
        source.regionEnd
      );

      if (blockRange) {
        decoded = spliceStream(decoded, [
          {
            regionStart: blockRange.blockStart,
            regionEnd: blockRange.blockEnd,
            replacement: concatBytes([pathContent, asciiBytes("\n")]),
          },
        ]);
      } else {
        const splices: StreamEdit[] = [
          {
            regionStart: source.regionStart,
            regionEnd: source.regionEnd,
            replacement: buildShowReplacement(source, new Uint8Array(0), 0),
          },
        ];
        decoded = spliceStream(decoded, splices);
        decoded = concatBytes([decoded, asciiBytes("\n"), pathContent]);
      }
      streamUpdates.set(streamNum, decoded);
      applied.push(f.locator);
    }
  }

  if (streamUpdates.size === 0) {
    return { output: original.slice(), applied, skipped };
  }

  const updates: IncrementalObject[] = [];
  for (const [streamNum, decoded] of streamUpdates) {
    const stream = doc.getObject(streamNum);
    if (!isStream(stream)) continue;
    const dict = cosDict(stream.dict.map);
    dict.map.delete("Filter");
    dict.map.delete("DecodeParms");
    dict.map.delete("DL");
    dict.map.set("Length", cosInt(decoded.length));
    const entry = doc.xrefEntry(streamNum);
    const gen = entry && entry.kind === "inuse" ? entry.gen : 0;
    updates.push({ num: streamNum, gen, obj: { type: "stream", dict, raw: decoded } });
  }

  if (updates.length === 0) {
    return {
      output: original.slice(),
      applied: [],
      skipped: flattens.map((f) => ({ locator: f.locator, reason: "not-found" })),
    };
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

export async function flattenTextRunsBytes(
  bytes: Uint8Array,
  flattens: TextFlatten[],
  inflate: InflateFn,
  deflate?: DeflateFn
): Promise<FlattenResult> {
  const doc = await CosDocument.open(bytes, { inflate });
  return flattenTextRuns(doc, flattens, deflate);
}
