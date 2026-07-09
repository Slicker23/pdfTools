/**
 * Cross-reference stream parser (PDF 1.5+).
 *
 * An xref stream is an indirect object whose dict has /Type /XRef and whose
 * (Flate-compressed, usually PNG-predicted) body encodes fixed-width entries
 * described by /W, /Index and /Size.
 */
import type { InflateFn } from "../platform";
import { ObjectParser } from "../cos/object-parser";
import { flateDecode } from "../filters/flate";
import {
  asNumber,
  dictGet,
  isArray,
  isStream,
  type CosDict,
  type CosObject,
} from "../cos/types";
import type { XrefEntry } from "./entries";

export interface XrefStreamResult {
  entries: XrefEntry[];
  trailer: CosDict;
}

function readInts(obj: CosObject | undefined): number[] {
  if (!isArray(obj)) return [];
  return obj.items.map((it) => asNumber(it) ?? 0);
}

/** Parse an xref stream located at `offset` (start of "<num> <gen> obj"). */
export async function parseXrefStream(
  buf: Uint8Array,
  offset: number,
  inflate: InflateFn
): Promise<XrefStreamResult> {
  const parser = new ObjectParser(buf, offset);
  const { obj } = parser.parseIndirectObject();
  if (!isStream(obj)) {
    throw new Error(`Object at offset ${offset} is not an xref stream`);
  }
  const dict = obj.dict;

  const decodeParms = dictGet(dict, "DecodeParms") ?? dictGet(dict, "DP");
  const decoded = await flateDecode(obj.raw, decodeParms, inflate);

  const wArr = dictGet(dict, "W");
  const w = readInts(wArr);
  if (w.length < 3) {
    throw new Error("xref stream /W must have 3 elements");
  }
  const [w0, w1, w2] = [w[0]!, w[1]!, w[2]!];
  const entryLen = w0 + w1 + w2;
  if (entryLen <= 0) {
    throw new Error("xref stream /W yields zero-length entries");
  }

  const size = asNumber(dictGet(dict, "Size")) ?? 0;
  let index: number[];
  const indexArr = dictGet(dict, "Index");
  if (isArray(indexArr)) {
    index = readInts(indexArr);
  } else {
    index = [0, size];
  }

  const entries: XrefEntry[] = [];
  let pos = 0;
  const readField = (width: number): number => {
    let v = 0;
    for (let i = 0; i < width; i++) {
      v = v * 256 + (decoded[pos++] ?? 0);
    }
    return v;
  };

  for (let s = 0; s + 1 < index.length; s += 2) {
    const startNum = index[s]!;
    const count = index[s + 1]!;
    for (let i = 0; i < count; i++) {
      if (pos + entryLen > decoded.length) break;
      const type = w0 === 0 ? 1 : readField(w0);
      const f2 = readField(w1);
      const f3 = readField(w2);
      const num = startNum + i;
      if (type === 0) {
        entries.push({ kind: "free", num, gen: f3 });
      } else if (type === 1) {
        entries.push({ kind: "inuse", num, gen: f3, offset: f2 });
      } else if (type === 2) {
        entries.push({ kind: "compressed", num, streamNum: f2, index: f3 });
      }
    }
  }

  return { entries, trailer: dict };
}
