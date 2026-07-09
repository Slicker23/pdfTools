/**
 * Minimal TrueType / OpenType `glyf` outline parser (M6).
 *
 * Reads sfnt-wrapped fonts (FontFile2 or sfnt-in-FontFile3). Supports simple
 * and composite glyphs, cmap formats 4 and 12.
 */
import type { GlyphOutline, PathSegment } from "./types";

interface TableDir {
  tag: string;
  offset: number;
  length: number;
}

function readU16(data: DataView, off: number): number {
  return data.getUint16(off, false);
}

function readI16(data: DataView, off: number): number {
  return data.getInt16(off, false);
}

function readU32(data: DataView, off: number): number {
  return data.getUint32(off, false);
}

function readTag(data: Uint8Array, off: number): string {
  return String.fromCharCode(data[off]!, data[off + 1]!, data[off + 2]!, data[off + 3]!);
}

function parseTableDirectory(data: Uint8Array): Map<string, TableDir> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numTables = readU16(view, 4);
  const tables = new Map<string, TableDir>();
  let pos = 12;
  for (let i = 0; i < numTables; i++) {
    const tag = readTag(data, pos);
    tables.set(tag, {
      tag,
      offset: readU32(view, pos + 8),
      length: readU32(view, pos + 12),
    });
    pos += 16;
  }
  return tables;
}

export interface TrueTypeFace {
  unitsPerEm: number;
  numGlyphs: number;
  locaShort: boolean;
  /** Unicode code point -> glyph index. */
  cmap: Map<number, number>;
  /** Glyph name -> glyph index (from post table, when present). */
  postNames: Map<string, number>;
  getGlyphOutline(gid: number): GlyphOutline | undefined;
  gidForUnicode(cp: number): number | undefined;
  gidForName(name: string): number | undefined;
}

interface GlyfTables {
  data: Uint8Array;
  view: DataView;
  locaOff: number;
  glyfOff: number;
  locaShort: boolean;
  numGlyphs: number;
}

function locaOffset(t: GlyfTables, gid: number): [number, number] {
  const { view, locaOff, locaShort, numGlyphs } = t;
  if (gid < 0 || gid >= numGlyphs) return [0, 0];
  if (locaShort) {
    const start = readU16(view, locaOff + gid * 2) * 2;
    const end = readU16(view, locaOff + (gid + 1) * 2) * 2;
    return [start, end];
  }
  const start = readU32(view, locaOff + gid * 4);
  const end = readU32(view, locaOff + (gid + 1) * 4);
  return [start, end];
}

function readCoord(
  data: Uint8Array,
  pos: { i: number },
  same: boolean,
  shortFlag: boolean,
  delta: number
): number {
  if (same) return delta;
  if (shortFlag) {
    const v = data[pos.i]!;
    pos.i++;
    return delta + ((v > 127 ? v - 256 : v) as number);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const v = readI16(view, pos.i);
  pos.i += 2;
  return delta + v;
}

function parseSimpleGlyph(data: Uint8Array, start: number, end: number): GlyphOutline {
  if (end <= start) return { segments: [] };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const nContours = readI16(view, start);
  if (nContours <= 0) return { segments: [] };

  const endPts: number[] = [];
  let pos = start + 2;
  for (let i = 0; i < nContours; i++) {
    endPts.push(readU16(view, pos));
    pos += 2;
  }
  const instrLen = readU16(view, pos);
  pos += 2 + instrLen;
  const nPoints = endPts[nContours - 1]! + 1;

  const flags: number[] = new Array(nPoints);
  const xs: number[] = new Array(nPoints);
  const ys: number[] = new Array(nPoints);
  const onCurve: boolean[] = new Array(nPoints);

  for (let i = 0; i < nPoints; ) {
    const f = data[pos]!;
    pos++;
    flags[i] = f;
    onCurve[i] = (f & 1) !== 0;
    i++;
    const repeat = (f & 8) !== 0 ? data[pos++]! : 0;
    for (let r = 0; r < repeat; r++) {
      flags[i] = f;
      onCurve[i] = (f & 1) !== 0;
      i++;
    }
  }

  const cx = { i: pos };
  let x = 0;
  for (let i = 0; i < nPoints; i++) {
    x = readCoord(data, cx, (flags[i]! & 16) !== 0, (flags[i]! & 2) !== 0, x);
    xs[i] = x;
  }
  const cy = { i: cx.i };
  let y = 0;
  for (let i = 0; i < nPoints; i++) {
    y = readCoord(data, cy, (flags[i]! & 32) !== 0, (flags[i]! & 4) !== 0, y);
    ys[i] = y;
  }

  const segments: PathSegment[] = [];
  let ptStart = 0;
  for (let c = 0; c < nContours; c++) {
    const ptEnd = endPts[c]!;
    const count = ptEnd - ptStart + 1;
    if (count < 1) {
      ptStart = ptEnd + 1;
      continue;
    }

    const indices: number[] = [];
    for (let k = 0; k < count; k++) indices.push(ptStart + k);

    // Ensure contour starts on-curve.
    let startIdx = 0;
    if (!onCurve[indices[0]!]!) {
      const last = indices[count - 1]!;
      if (onCurve[last]!) startIdx = count - 1;
    }

    const first = indices[startIdx]!;
    segments.push({ op: "M", x: xs[first]!, y: ys[first]! });

    let i = 1;
    const n = count;
    while (i <= n) {
      const cur = indices[(startIdx + i) % count]!;
      const prev = indices[(startIdx + i - 1) % count]!;
      if (onCurve[cur]!) {
        if (!onCurve[prev]!) {
          // Previous was off-curve control; cur is on-curve endpoint.
          segments.push({ op: "Q", x1: xs[prev]!, y1: ys[prev]!, x: xs[cur]!, y: ys[cur]! });
        } else {
          segments.push({ op: "L", x: xs[cur]!, y: ys[cur]! });
        }
        i++;
      } else {
        const next = indices[(startIdx + i + 1) % count]!;
        if (onCurve[next]!) {
          segments.push({ op: "Q", x1: xs[cur]!, y1: ys[cur]!, x: xs[next]!, y: ys[next]! });
          i += 2;
        } else {
          const mx = (xs[cur]! + xs[next]!) / 2;
          const my = (ys[cur]! + ys[next]!) / 2;
          segments.push({ op: "Q", x1: xs[cur]!, y1: ys[cur]!, x: mx, y: my });
          i++;
        }
      }
    }
    segments.push({ op: "Z" });
    ptStart = ptEnd + 1;
  }
  return { segments };
}

function parseCompositeGlyph(
  tables: GlyfTables,
  data: Uint8Array,
  start: number,
  end: number,
  depth: number
): GlyphOutline {
  if (depth > 8) return { segments: [] };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const segments: PathSegment[] = [];
  let pos = start + 2; // skip contour count (-1)

  const ARG_1_AND_2_ARE_WORDS = 1;
  const WE_HAVE_A_SCALE = 8;
  const MORE_COMPONENTS = 32;
  const WE_HAVE_A_TWO_BY_TWO = 128;

  let flags = MORE_COMPONENTS;
  while (flags & MORE_COMPONENTS) {
    flags = readU16(view, pos);
    pos += 2;
    const gid = readU16(view, pos);
    pos += 2;

    let dx = 0;
    let dy = 0;
    if (flags & ARG_1_AND_2_ARE_WORDS) {
      dx = readI16(view, pos);
      dy = readI16(view, pos + 2);
      pos += 4;
    } else {
      dx = view.getInt8(pos);
      dy = view.getInt8(pos + 1);
      pos += 2;
    }

    let a = 1;
    let b = 0;
    let c = 0;
    let d = 1;
    if (flags & WE_HAVE_A_TWO_BY_TWO) {
      a = readI16(view, pos) / 16384;
      b = readI16(view, pos + 2) / 16384;
      c = readI16(view, pos + 4) / 16384;
      d = readI16(view, pos + 6) / 16384;
      pos += 8;
    } else if (flags & WE_HAVE_A_SCALE) {
      a = d = readI16(view, pos) / 16384;
      pos += 2;
    }

    const child = parseGlyphOutline(tables, gid, depth + 1);
    for (const s of child.segments) {
      switch (s.op) {
        case "M": {
          const x = a * s.x + c * s.y + dx;
          const y = b * s.x + d * s.y + dy;
          segments.push({ op: "M", x, y });
          break;
        }
        case "L": {
          const x = a * s.x + c * s.y + dx;
          const y = b * s.x + d * s.y + dy;
          segments.push({ op: "L", x, y });
          break;
        }
        case "Q": {
          const x1 = a * s.x1 + c * s.y1 + dx;
          const y1 = b * s.x1 + d * s.y1 + dy;
          const x = a * s.x + c * s.y + dx;
          const y = b * s.x + d * s.y + dy;
          segments.push({ op: "Q", x1, y1, x, y });
          break;
        }
        case "C": {
          const x1 = a * s.x1 + c * s.y1 + dx;
          const y1 = b * s.x1 + d * s.y1 + dy;
          const x2 = a * s.x2 + c * s.y2 + dx;
          const y2 = b * s.x2 + d * s.y2 + dy;
          const x = a * s.x + c * s.y + dx;
          const y = b * s.x + d * s.y + dy;
          segments.push({ op: "C", x1, y1, x2, y2, x, y });
          break;
        }
        case "Z":
          segments.push(s);
          break;
      }
    }
  }
  return { segments };
}

function parseGlyphOutline(tables: GlyfTables, gid: number, depth = 0): GlyphOutline {
  const [start, end] = locaOffset(tables, gid);
  if (end <= start) return { segments: [] };
  const glyfStart = tables.glyfOff + start;
  const view = new DataView(tables.data.buffer, tables.data.byteOffset, tables.data.byteLength);
  const nContours = readI16(view, glyfStart);
  if (nContours < 0) {
    return parseCompositeGlyph(tables, tables.data, glyfStart, glyfStart + (end - start), depth);
  }
  return parseSimpleGlyph(tables.data, glyfStart, glyfStart + (end - start));
}

function parseCmap(data: Uint8Array, off: number, len: number): Map<number, number> {
  const map = new Map<number, number>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const nSub = readU16(view, off + 2);
  let best = -1;
  let bestOff = 0;
  for (let i = 0; i < nSub; i++) {
    const base = off + 4 + i * 8;
    const platform = readU16(view, base);
    const encoding = readU16(view, base + 2);
    const subOff = readU32(view, base + 4) + off;
    // Prefer Unicode BMP/full (platform 0 or 3, encoding 1/4/10).
    const score =
      platform === 3 && encoding === 1
        ? 100
        : platform === 0 && encoding === 3
          ? 99
          : platform === 3 && encoding === 10
            ? 98
            : platform === 0 && encoding === 4
              ? 97
              : platform === 3 && encoding === 4
                ? 96
                : 0;
    if (score > best) {
      best = score;
      bestOff = subOff;
    }
  }
  if (best < 0) return map;

  const fmt = readU16(view, bestOff);
  if (fmt === 4) {
    const segCount = readU16(view, bestOff + 6) / 2;
    const endCodes = bestOff + 14;
    const startCodes = endCodes + segCount * 2 + 2;
    const idDelta = startCodes + segCount * 2;
    const idRange = idDelta + segCount * 2;
    let ro = idRange + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      const start = readU16(view, startCodes + i * 2);
      const end = readU16(view, endCodes + i * 2);
      const delta = readI16(view, idDelta + i * 2);
      const range = readU16(view, idRange + i * 2);
      for (let cp = start; cp <= end; cp++) {
        if (cp === 0xffff) continue;
        let gid: number;
        if (range === 0) {
          gid = (cp + delta) & 0xffff;
        } else {
          const goff = ro + (cp - start) * 2;
          gid = readU16(view, goff);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) map.set(cp, gid);
      }
      if (range !== 0) ro += (end - start + 1) * 2;
    }
  } else if (fmt === 12) {
    const nGroups = readU32(view, bestOff + 12);
    let gpos = bestOff + 16;
    for (let i = 0; i < nGroups; i++) {
      const start = readU32(view, gpos);
      const end = readU32(view, gpos + 4);
      const startGid = readU32(view, gpos + 8);
      for (let cp = start; cp <= end; cp++) {
        map.set(cp, startGid + (cp - start));
      }
      gpos += 12;
    }
  }
  return map;
}

function parsePostNames(data: Uint8Array, off: number): Map<string, number> {
  const names = new Map<string, number>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const fmt = readU32(view, off);
  if (fmt !== 2) return names;
  const n = readU16(view, off + 32);
  let pos = off + 34;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(data[pos]!);
    pos++;
  }
  for (let i = 0; i < n; i++) {
    const len = data[pos]!;
    pos++;
    const name = new TextDecoder().decode(data.subarray(pos, pos + len));
    pos += len;
    names.set(name, indices[i]!);
  }
  return names;
}

/** Parse an sfnt-wrapped TrueType/OpenType font buffer. */
export function parseTrueType(data: Uint8Array): TrueTypeFace | undefined {
  if (data.length < 12) return undefined;
  const sig = readTag(data, 0);
  if (sig !== "\x00\x01\x00\x00" && sig !== "OTTO" && sig !== "true") return undefined;

  const tables = parseTableDirectory(data);
  const head = tables.get("head");
  const loca = tables.get("loca");
  const glyf = tables.get("glyf");
  const maxp = tables.get("maxp");
  const cmap = tables.get("cmap");
  if (!head || !loca || !glyf || !maxp) return undefined;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const unitsPerEm = readU16(view, head.offset + 18);
  const locaShort = readU16(view, head.offset + 50) === 0;
  const numGlyphs = readU16(view, maxp.offset + 4);

  const glyfTables: GlyfTables = {
    data,
    view,
    locaOff: loca.offset,
    glyfOff: glyf.offset,
    locaShort,
    numGlyphs,
  };

  const unicodeCmap = cmap ? parseCmap(data, cmap.offset, cmap.length) : new Map<number, number>();
  const post = tables.get("post");
  const postNames = post ? parsePostNames(data, post.offset) : new Map<string, number>();

  return {
    unitsPerEm,
    numGlyphs,
    locaShort,
    cmap: unicodeCmap,
    postNames,
    getGlyphOutline(gid: number) {
      return parseGlyphOutline(glyfTables, gid);
    },
    gidForUnicode(cp: number) {
      return unicodeCmap.get(cp);
    },
    gidForName(name: string) {
      return postNames.get(name);
    },
  };
}
