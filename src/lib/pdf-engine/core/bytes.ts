/**
 * Byte-level primitives shared by the COS layer.
 *
 * PDF is a byte format: strings are byte sequences, not text. Everything here
 * operates on `Uint8Array` so the engine stays isomorphic (no Node Buffer) and
 * byte-exact (no lossy string conversions).
 */

export const NUL = 0x00;
export const TAB = 0x09;
export const LF = 0x0a;
export const FF = 0x0c;
export const CR = 0x0d;
export const SP = 0x20;

// ( ) < > [ ] { } / %
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

export function isWhitespace(b: number): boolean {
  return b === NUL || b === TAB || b === LF || b === FF || b === CR || b === SP;
}

export function isEol(b: number): boolean {
  return b === LF || b === CR;
}

export function isDelimiter(b: number): boolean {
  return DELIMITERS.has(b);
}

/** A "regular" character is anything that is neither whitespace nor a delimiter. */
export function isRegular(b: number): boolean {
  return !isWhitespace(b) && !isDelimiter(b);
}

export function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

export function isHexDigit(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x46) ||
    (b >= 0x61 && b <= 0x66)
  );
}

export function hexVal(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return 0;
}

/** Encode a JS string as Latin-1/ASCII bytes (each char -> low byte). */
export function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Decode bytes as Latin-1 so every byte maps 1:1 to a char (round-trippable). */
export function bytesToLatin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Does `buf` contain `needle` (ascii) starting exactly at `pos`? */
export function matchAscii(buf: Uint8Array, pos: number, needle: string): boolean {
  if (pos < 0 || pos + needle.length > buf.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (buf[pos + i] !== (needle.charCodeAt(i) & 0xff)) return false;
  }
  return true;
}

/** Find the first index of `needle` (ascii) at or after `from`, or -1. */
export function indexOfAscii(buf: Uint8Array, needle: string, from = 0): number {
  const first = needle.charCodeAt(0) & 0xff;
  for (let i = from; i <= buf.length - needle.length; i++) {
    if (buf[i] === first && matchAscii(buf, i, needle)) return i;
  }
  return -1;
}

/** Find the last index of `needle` (ascii) at or before `from` (default end). */
export function lastIndexOfAscii(buf: Uint8Array, needle: string, from?: number): number {
  const first = needle.charCodeAt(0) & 0xff;
  const start = Math.min(from ?? buf.length - needle.length, buf.length - needle.length);
  for (let i = start; i >= 0; i--) {
    if (buf[i] === first && matchAscii(buf, i, needle)) return i;
  }
  return -1;
}

/**
 * Growable byte buffer for serialization. Avoids repeated array copies by
 * collecting chunks and concatenating once.
 */
export class ByteWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;

  get length(): number {
    return this.len;
  }

  bytes(data: Uint8Array): this {
    this.chunks.push(data);
    this.len += data.length;
    return this;
  }

  byte(b: number): this {
    this.chunks.push(Uint8Array.of(b & 0xff));
    this.len += 1;
    return this;
  }

  ascii(s: string): this {
    return this.bytes(asciiBytes(s));
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.len);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
