/**
 * Cross-reference recovery.
 *
 * When the xref table/stream is missing or corrupt (no startxref, truncated
 * tail, wrong offsets), rebuild the object index by scanning the whole file for
 * "<num> <gen> obj" and locate a trailer (or a /Catalog) by scanning. This is
 * the same last-resort strategy real viewers use to open damaged PDFs.
 */
import { bytesToLatin1 } from "../bytes";
import { ObjectParser } from "../cos/object-parser";
import { cosDict, cosRef, isDict, type CosObject } from "../cos/types";
import type { XrefEntry, XrefResult } from "./entries";

const OBJ_RE = /(\d+)\s+(\d+)\s+obj\b/g;
const TRAILER_RE = /trailer\b/g;

export function recoverXref(buf: Uint8Array): XrefResult {
  const text = bytesToLatin1(buf);
  const entries = new Map<number, XrefEntry>();

  // Last definition of an object number wins (mirrors incremental updates).
  OBJ_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OBJ_RE.exec(text)) !== null) {
    const num = parseInt(m[1]!, 10);
    const gen = parseInt(m[2]!, 10);
    entries.set(num, { kind: "inuse", num, gen, offset: m.index });
  }

  const trailer = findTrailer(buf, text) ?? synthesizeTrailer(buf, entries);
  return { entries, trailer };
}

function findTrailer(buf: Uint8Array, text: string) {
  TRAILER_RE.lastIndex = 0;
  let best: CosObject | undefined;
  let m: RegExpExecArray | null;
  while ((m = TRAILER_RE.exec(text)) !== null) {
    try {
      const dict = new ObjectParser(buf, m.index + "trailer".length).parseObject();
      if (isDict(dict) && dict.map.has("Root")) best = dict; // keep the last valid one
    } catch {
      // ignore malformed trailer
    }
  }
  return isDict(best) ? best : undefined;
}

/** No usable trailer: find an object whose /Type is /Catalog and point Root at it. */
function synthesizeTrailer(buf: Uint8Array, entries: Map<number, XrefEntry>) {
  for (const [num, entry] of entries) {
    if (entry.kind !== "inuse") continue;
    try {
      const obj = new ObjectParser(buf, entry.offset).parseIndirectObject().obj;
      const type = isDict(obj) ? obj.map.get("Type") : undefined;
      if (type && type.type === "name" && type.name === "Catalog") {
        return cosDict([["Root", cosRef(num, entry.gen)]]);
      }
    } catch {
      // ignore
    }
  }
  // Nothing found - empty dict (caller will fail validation and surface an error).
  return cosDict();
}
