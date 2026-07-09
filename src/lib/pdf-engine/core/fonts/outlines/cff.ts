/**
 * Compact Font Format (CFF) container parser (M6).
 *
 * Parses the CFF INDEX/DICT structure and exposes CharStrings for Type2
 * interpretation. Handles raw CFF (FontFile3) and sfnt with `CFF ` table.
 */
import { parseTrueType, type TrueTypeFace } from "./ttf";

export interface CffFont {
  charStrings: Uint8Array[];
  globalSubrs: Uint8Array[];
  defaultWidthX: number;
  nominalWidthX: number;
  nGlyphs: number;
}

function readU8(data: Uint8Array, off: number): number {
  return data[off]!;
}

function readU16(data: Uint8Array, off: number): number {
  return (data[off]! << 8) | data[off + 1]!;
}

function readOffset(data: Uint8Array, off: number, offSize: number): number {
  let v = 0;
  for (let i = 0; i < offSize; i++) v = (v << 8) | data[off + i]!;
  return v;
}

function parseIndex(data: Uint8Array, start: number): { items: Uint8Array[]; next: number } {
  const count = readU16(data, start);
  if (count === 0) return { items: [], next: start + 2 };
  const offSize = readU8(data, start + 2);
  const dataStart = start + 3 + (count + 1) * offSize;
  const items: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const o1 = readOffset(data, start + 3 + i * offSize, offSize);
    const o2 = readOffset(data, start + 3 + (i + 1) * offSize, offSize);
    items.push(data.subarray(dataStart + o1 - 1, dataStart + o2 - 1));
  }
  return { items, next: dataStart + readOffset(data, start + 3 + count * offSize, offSize) - 1 };
}

function readDictNumber(data: Uint8Array, pos: number): [number, number] {
  const b0 = data[pos]!;
  if (b0 >= 32 && b0 <= 246) return [b0 - 139, pos + 1];
  if (b0 >= 247 && b0 <= 250) return [(b0 - 247) * 256 + data[pos + 1]! + 108, pos + 2];
  if (b0 >= 251 && b0 <= 254) return [-(b0 - 251) * 256 - data[pos + 1]! - 108, pos + 2];
  if (b0 === 28) return [(data[pos + 1]! << 8) | data[pos + 2]!, pos + 3];
  if (b0 === 29) {
    const v =
      (data[pos + 1]! << 24) |
      (data[pos + 2]! << 16) |
      (data[pos + 3]! << 8) |
      data[pos + 4]!;
    return [v, pos + 5];
  }
  return [0, pos + 1];
}

function parseTopDict(
  dict: Uint8Array,
  baseOffset: number
): { defaultWidthX: number; nominalWidthX: number; charStringIndexOff: number } {
  let defaultWidthX = 0;
  let nominalWidthX = 0;
  let charStringIndexOff = 0;
  let pos = 0;
  const stack: number[] = [];
  while (pos < dict.length) {
    const b = dict[pos]!;
    if (b >= 0 && b <= 27) {
      pos++;
      continue;
    }
    if (b === 28 || b === 29 || (b >= 32 && b <= 255)) {
      const [n, np] = readDictNumber(dict, pos);
      stack.push(n);
      pos = np;
      continue;
    }
    if (b === 12) {
      pos += 2;
      continue;
    }
    const op = b;
    pos++;
    if (op === 15 && stack.length) charStringIndexOff = stack.pop()!;
    if (op === 20 && stack.length) defaultWidthX = stack.pop()!;
    if (op === 21 && stack.length) nominalWidthX = stack.pop()!;
    stack.length = 0;
  }
  return { defaultWidthX, nominalWidthX, charStringIndexOff: baseOffset + charStringIndexOff };
}

export function extractCffBytes(data: Uint8Array): Uint8Array | undefined {
  if (data.length < 4) return undefined;
  if (data[0] === 0x00 && data[1] === 0x01 && data[2] === 0x00 && data[3] === 0x00) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const numTables = view.getUint16(4, false);
    let pos = 12;
    for (let i = 0; i < numTables; i++) {
      const tag = String.fromCharCode(data[pos]!, data[pos + 1]!, data[pos + 2]!, data[pos + 3]!);
      if (tag === "CFF ") {
        const off = view.getUint32(pos + 8, false);
        const len = view.getUint32(pos + 12, false);
        return data.subarray(off, off + len);
      }
      pos += 16;
    }
    return undefined;
  }
  if (data[0] === 1) return data;
  return undefined;
}

export function parseCff(data: Uint8Array): CffFont | undefined {
  const cff = extractCffBytes(data);
  if (!cff || cff.length < 4) return undefined;
  const hdrSize = cff[2]!;
  let pos = hdrSize;

  const nameIdx = parseIndex(cff, pos);
  pos = nameIdx.next;
  const topIdx = parseIndex(cff, pos);
  pos = topIdx.next;
  pos = parseIndex(cff, pos).next; // strings
  const globalSubrIdx = parseIndex(cff, pos);
  pos = globalSubrIdx.next;

  if (topIdx.items.length === 0) return undefined;
  const topDict = topIdx.items[0]!;
  const { defaultWidthX, nominalWidthX, charStringIndexOff } = parseTopDict(topDict, pos);
  const charIdx = parseIndex(cff, charStringIndexOff);

  return {
    charStrings: charIdx.items,
    globalSubrs: globalSubrIdx.items,
    defaultWidthX,
    nominalWidthX,
    nGlyphs: charIdx.items.length,
  };
}

export function parseFontProgram(data: Uint8Array):
  | { kind: "truetype"; face: TrueTypeFace }
  | { kind: "cff"; cff: CffFont }
  | undefined {
  const tt = parseTrueType(data);
  if (tt) return { kind: "truetype", face: tt };
  const cff = parseCff(data);
  if (cff) return { kind: "cff", cff };
  return undefined;
}
