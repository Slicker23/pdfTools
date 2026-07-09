/**
 * Native text insertion (M5): append BT…ET runs to a page content stream.
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
  cosName,
  cosRef,
  dictGet,
  isDict,
  isRef,
  isStream,
  type CosDict,
  type CosRef,
} from "../cos/types";
import { buildShowReplacement, spliceStream, type StreamEdit } from "./edit-run";
import {
  buildStandardInsertFontDict,
  parseFontVariant,
  resolveInsertFontForPage,
} from "./font-embed";
import { resourceCategory } from "../resources";
import { writeIncrementalUpdate, type IncrementalObject } from "../writer/incremental";
import type { PdfEditBlockPatch } from "../../../pdf/edit-model";
import { layoutTextLines, TEXT_LINE_HEIGHT } from "../../../pdf/text-layout";
import type { Font } from "../fonts/types";

export interface InsertResult {
  output: Uint8Array;
  inserted: number;
  skipped: number;
  insertedIds: string[];
  skippedIds: string[];
}

function newestXrefIsStream(bytes: Uint8Array): boolean {
  const offset = readStartXref(bytes);
  const probe = new Lexer(bytes, offset);
  probe.skipWhitespaceAndComments();
  return !matchAscii(bytes, probe.pos, "xref");
}

async function rebuildStreamAppend(
  doc: CosDocument,
  streamNum: number,
  append: Uint8Array
): Promise<IncrementalObject | undefined> {
  const stream = doc.getObject(streamNum);
  if (!isStream(stream)) return undefined;
  const decoded = await doc.decodeStream(stream);
  const edit: StreamEdit = {
    regionStart: decoded.length,
    regionEnd: decoded.length,
    replacement: append,
  };
  const newDecoded = spliceStream(decoded, [edit]);
  const dict = cosDict(stream.dict.map);
  dict.map.delete("Filter");
  dict.map.delete("DecodeParms");
  dict.map.delete("DL");
  dict.map.set("Length", cosInt(newDecoded.length));
  const entry = doc.xrefEntry(streamNum);
  const gen = entry && entry.kind === "inuse" ? entry.gen : 0;
  return { num: streamNum, gen, obj: { type: "stream", dict, raw: newDecoded } };
}

function parseRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function standardBase14Name(target: PdfEditBlockPatch["font"]): string {
  const name = target?.name ?? "Helvetica";
  const parsed = parseFontVariant(name);
  const bold = target?.bold ?? parsed.bold;
  const italic = target?.italic ?? parsed.italic;
  if (/times|georgia|serif/i.test(name) && !/sans/i.test(name)) {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (/courier|mono/i.test(name)) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function nextInsertFontName(pageFonts: Map<string, unknown>): string {
  let n = 0;
  while (pageFonts.has(`FzIns${n}`)) n++;
  return `FzIns${n}`;
}

function buildPageFontRegistrationUpdate(
  doc: CosDocument,
  pageNum: number,
  pageGen: number,
  pageDict: CosDict,
  resources: CosDict,
  fontResourceName: string,
  fontObjNum: number
): IncrementalObject {
  const fonts = resourceCategory(doc, resources, "Font");
  const newFonts = cosDict(new Map(fonts.map));
  newFonts.map.set(fontResourceName, cosRef(fontObjNum, 0));

  const newResources = cosDict(new Map(resources.map));
  newResources.map.set("Font", newFonts);

  const newPageDict = cosDict(new Map(pageDict.map));
  newPageDict.map.set("Resources", newResources);

  return { num: pageNum, gen: pageGen, obj: newPageDict };
}

/** Apply user-created text blocks by appending native content-stream operators. */
export async function insertTextBlocks(
  input: Uint8Array,
  blocks: PdfEditBlockPatch[],
  deflate?: DeflateFn,
  inflate?: InflateFn
): Promise<InsertResult> {
  const created = blocks.filter((b) => b.created && !b.deleted && (b.text ?? "").trim());
  if (!created.length) {
    return { output: input.slice(), inserted: 0, skipped: 0, insertedIds: [], skippedIds: [] };
  }

  const doc = await CosDocument.open(input, {
    inflate: inflate ?? (async (b) => b),
  });
  if (doc.encrypted) {
    return {
      output: input.slice(),
      inserted: 0,
      skipped: created.length,
      insertedIds: [],
      skippedIds: created.map((b) => b.id),
    };
  }

  let baseOffsets: Map<number, { offset: number; gen: number }> | undefined;
  if (doc.recovered) {
    baseOffsets = new Map();
    for (const num of doc.objectNumbers()) {
      const entry = doc.xrefEntry(num);
      if (!entry || entry.kind !== "inuse") {
        return {
          output: input.slice(),
          inserted: 0,
          skipped: created.length,
          insertedIds: [],
          skippedIds: created.map((b) => b.id),
        };
      }
      baseOffsets.set(num, { offset: entry.offset, gen: entry.gen });
    }
  }

  const rootRef = dictGet(doc.trailer, "Root");
  if (!isRef(rootRef)) {
    return {
      output: input.slice(),
      inserted: 0,
      skipped: created.length,
      insertedIds: [],
      skippedIds: created.map((b) => b.id),
    };
  }

  const pages = doc.pages();
  const streamAppends = new Map<number, Uint8Array[]>();
  const updates: IncrementalObject[] = [];
  let nextObjNum = asNumber(dictGet(doc.trailer, "Size")) ?? 0;
  const pageFontCache = new Map<number, { fontRef: string; font: Font }>();

  let inserted = 0;
  let skipped = 0;
  const insertedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const block of created) {
    const pageIdx = (block.page ?? 1) - 1;
    const page = pages[pageIdx];
    if (!page?.ref) {
      skipped++;
      skippedIds.push(block.id);
      continue;
    }

    const segs = await doc.pageContentSegments(page);
    const streamSeg = [...segs].reverse().find((s) => s.streamNum != null);
    if (!streamSeg?.streamNum) {
      skipped++;
      skippedIds.push(block.id);
      continue;
    }

    const targetFont = block.font ?? {
      name: "Helvetica",
      size: 12,
      bold: false,
      italic: false,
      color: "#111111",
    };
    const pageW = page.width ?? 612;
    const lines = layoutTextLines(
      block.text ?? "",
      targetFont,
      pageW,
      block.bbox?.px ?? block.insertAt?.px ?? 0,
      block.bbox?.pw ?? pageW
    );
    const text = lines.join("\n");

    let resolved = pageFontCache.get(pageIdx);
    if (!resolved) {
      resolved = await resolveInsertFontForPage(doc, page, text, targetFont);
      if (!resolved) {
        const base14 = standardBase14Name(targetFont);
        const fontDict = buildStandardInsertFontDict(base14);
        const font = await doc.buildFontForDict(fontDict);
        if (!font.encode) {
          skipped++;
          skippedIds.push(block.id);
          continue;
        }
        const enc = font.encode(text);
        if (enc.unencodable.length > 0) {
          skipped++;
          skippedIds.push(block.id);
          continue;
        }

        const pageFonts = resourceCategory(doc, page.resources, "Font").map;
        const fontResourceName = nextInsertFontName(pageFonts);
        const fontObjNum = nextObjNum++;
        updates.push({ num: fontObjNum, gen: 0, obj: fontDict });

        const pageEntry = doc.xrefEntry(page.ref.num);
        const pageGen = pageEntry && pageEntry.kind === "inuse" ? pageEntry.gen : 0;
        updates.push(
          buildPageFontRegistrationUpdate(
            doc,
            page.ref.num,
            pageGen,
            page.dict,
            page.resources,
            fontResourceName,
            fontObjNum
          )
        );

        resolved = { fontRef: fontResourceName, font };
      }
      pageFontCache.set(pageIdx, resolved);
    }

    const px = block.insertAt?.px ?? block.bbox?.px ?? 0;
    const py = block.baselineY ?? block.insertAt?.py ?? block.bbox?.py ?? 0;
    const size = targetFont.size ?? 12;
    const leading = size * TEXT_LINE_HEIGHT;
    const fontName = resolved.fontRef.startsWith("/")
      ? resolved.fontRef
      : `/${resolved.fontRef}`;
    const [r, g, b] = parseRgb(block.font?.color ?? "#111111");

    const parts: Uint8Array[] = [
      asciiBytes(
        `\nBT\n${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n${fontName} ${size} Tf\n1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm\n`
      ),
    ];

    let lineFailed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (i > 0) {
        parts.push(asciiBytes(`0 ${-leading.toFixed(2)} Td\n`));
      }
      if (!line) continue;
      const lineEnc = resolved.font.encode!(line);
      if (lineEnc.unencodable.length > 0) {
        skipped++;
        skippedIds.push(block.id);
        lineFailed = true;
        break;
      }
      parts.push(buildShowReplacement({ op: "Tj" }, lineEnc.bytes, 0));
    }

    if (lineFailed) continue;

    parts.push(asciiBytes("\nET\n"));
    const chunk = concatBytes(parts);

    const list = streamAppends.get(streamSeg.streamNum) ?? [];
    list.push(chunk);
    streamAppends.set(streamSeg.streamNum, list);
    inserted++;
    insertedIds.push(block.id);
  }

  if (streamAppends.size === 0 && updates.length === 0) {
    return { output: input.slice(), inserted: 0, skipped, insertedIds, skippedIds };
  }

  for (const [streamNum, chunks] of streamAppends) {
    const combined = concatBytes(chunks);
    const obj = await rebuildStreamAppend(doc, streamNum, combined);
    if (obj) updates.push(obj);
  }

  const size = asNumber(dictGet(doc.trailer, "Size")) ?? 0;
  const output = await writeIncrementalUpdate({
    original: doc.bytes,
    updates,
    root: rootRef as CosRef,
    size: Math.max(size, nextObjNum),
    prevStartxref: baseOffsets ? 0 : readStartXref(doc.bytes),
    useXrefStream: baseOffsets ? false : newestXrefIsStream(doc.bytes),
    deflate,
    standalone: Boolean(baseOffsets),
    baseOffsets,
  });

  return { output, inserted, skipped, insertedIds, skippedIds };
}
