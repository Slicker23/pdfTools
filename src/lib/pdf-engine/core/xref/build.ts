/**
 * Cross-reference chain builder.
 *
 * Locates `startxref`, then walks the whole history of xref sections (classic
 * tables and/or xref streams), following /Prev and hybrid /XRefStm links.
 * Newer sections take precedence: an object number already resolved by a newer
 * section is never overwritten by an older one.
 */
import type { InflateFn } from "../platform";
import { lastIndexOfAscii, matchAscii } from "../bytes";
import { Lexer } from "../cos/lexer";
import { asNumber, dictGet, isDict, cosDict, type CosDict, type CosObject } from "../cos/types";
import { parseClassicXref } from "./classic";
import { parseXrefStream } from "./stream";
import type { XrefEntry, XrefResult } from "./entries";

/** Read the byte offset referenced by the final `startxref` in the file. */
export function readStartXref(buf: Uint8Array): number {
  const idx = lastIndexOfAscii(buf, "startxref");
  if (idx < 0) throw new Error("No startxref found");
  const lexer = new Lexer(buf, idx + "startxref".length);
  const tok = lexer.nextToken();
  if (tok.kind !== "int") throw new Error("Malformed startxref");
  return tok.num!;
}

function mergeTrailer(into: Map<string, CosObject>, from: CosDict): void {
  for (const [k, v] of from.map) {
    if (!into.has(k)) into.set(k, v);
  }
}

export async function buildXref(buf: Uint8Array, inflate: InflateFn): Promise<XrefResult> {
  const startOffset = readStartXref(buf);
  const entries = new Map<number, XrefEntry>();
  const trailerMap = new Map<string, CosObject>();
  const visited = new Set<number>();

  // Process offsets newest-first so newer entries win.
  const queue: number[] = [startOffset];

  const addEntries = (list: XrefEntry[]) => {
    for (const e of list) {
      if (!entries.has(e.num)) entries.set(e.num, e);
    }
  };

  while (queue.length) {
    const offset = queue.shift()!;
    if (offset < 0 || offset >= buf.length || visited.has(offset)) continue;
    visited.add(offset);

    const probe = new Lexer(buf, offset);
    probe.skipWhitespaceAndComments();

    if (matchAscii(buf, probe.pos, "xref")) {
      const { entries: list, trailer } = parseClassicXref(buf, offset);
      // Hybrid-reference files: the paired /XRefStm holds the authoritative
      // entries for this section (the classic table lists compressed objects as
      // free placeholders for legacy readers). It must therefore be applied
      // BEFORE the classic table so its entries win, then the classic table
      // fills any remaining gaps.
      const xrefStm = asNumber(dictGet(trailer, "XRefStm"));
      if (xrefStm != null && xrefStm >= 0 && xrefStm < buf.length && !visited.has(xrefStm)) {
        visited.add(xrefStm);
        try {
          const { entries: xlist, trailer: xtrailer } = await parseXrefStream(
            buf,
            xrefStm,
            inflate
          );
          addEntries(xlist);
          mergeTrailer(trailerMap, xtrailer);
        } catch {
          // Fall back to the classic table alone if the xref stream is unusable.
        }
      }
      addEntries(list);
      mergeTrailer(trailerMap, trailer);
      const prev = asNumber(dictGet(trailer, "Prev"));
      if (prev != null) queue.push(prev);
    } else {
      const { entries: list, trailer } = await parseXrefStream(buf, offset, inflate);
      addEntries(list);
      mergeTrailer(trailerMap, trailer);
      const prev = asNumber(dictGet(trailer, "Prev"));
      if (prev != null) queue.push(prev);
    }
  }

  const trailer = cosDict(trailerMap);
  if (!isDict(trailer) || trailer.map.size === 0) {
    throw new Error("Empty trailer after building xref");
  }
  return { entries, trailer };
}
