/**
 * /ToUnicode CMap parsing (ISO 32000-1, 9.10.3).
 *
 * Parses the `beginbfchar`/`beginbfrange` sections of a ToUnicode CMap into a
 * map from character code (the integer value of the shown bytes) to a Unicode
 * string. Destination values are hex UTF-16BE, per the spec.
 *
 * This is intentionally a focused parser: ToUnicode CMaps are a small, regular
 * subset of the PostScript CMap language, so we scan for the bf* blocks rather
 * than running a full interpreter.
 */

export interface ToUnicodeMap {
  /** code (integer value of the byte sequence) -> Unicode string. */
  map: Map<number, string>;
  lookup(code: number): string | undefined;
}

function hexToBytes(h: string): Uint8Array {
  const clean = h.replace(/[^0-9A-Fa-f]/g, "");
  const n = clean.length >> 1;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToInt(b: Uint8Array): number {
  let v = 0;
  for (const byte of b) v = v * 256 + byte;
  return v;
}

/** Interpret bytes as UTF-16BE. Values shorter than 2 bytes are treated as a code point. */
function utf16beToString(b: Uint8Array): string {
  if (b.length < 2) return b.length === 1 ? String.fromCharCode(b[0]!) : "";
  let out = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    out += String.fromCharCode((b[i]! << 8) | b[i + 1]!);
  }
  return out;
}

/** Split a bf* block body into tokens: `<hex>` groups and `[ ... ]` arrays. */
function tokenize(body: string): string[] {
  const tokens: string[] = [];
  const re = /<([0-9A-Fa-f\s]*)>|\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) tokens.push(m[0]!);
  return tokens;
}

function parseArray(tok: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  const re = /<([0-9A-Fa-f\s]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tok))) out.push(hexToBytes(m[1]!));
  return out;
}

export function parseToUnicode(bytes: Uint8Array): ToUnicodeMap {
  // ToUnicode CMaps are ASCII/latin1 text.
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]!);

  const map = new Map<number, string>();

  // beginbfchar ... endbfchar : pairs of <src> <dst>.
  const charRe = /beginbfchar([\s\S]*?)endbfchar/g;
  let block: RegExpExecArray | null;
  while ((block = charRe.exec(text))) {
    const toks = tokenize(block[1]!);
    for (let i = 0; i + 1 < toks.length; i += 2) {
      const src = toks[i]!;
      const dst = toks[i + 1]!;
      if (src.startsWith("[")) continue;
      const code = bytesToInt(hexToBytes(src.slice(1, -1)));
      const str = dst.startsWith("[")
        ? parseArray(dst).map(utf16beToString).join("")
        : utf16beToString(hexToBytes(dst.slice(1, -1)));
      map.set(code, str);
    }
  }

  // beginbfrange ... endbfrange : triples of <lo> <hi> (<dst> | [ ... ]).
  const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((block = rangeRe.exec(text))) {
    const toks = tokenize(block[1]!);
    for (let i = 0; i + 2 < toks.length; i += 3) {
      const loTok = toks[i]!;
      const hiTok = toks[i + 1]!;
      const dstTok = toks[i + 2]!;
      if (loTok.startsWith("[") || hiTok.startsWith("[")) continue;
      const lo = bytesToInt(hexToBytes(loTok.slice(1, -1)));
      const hi = bytesToInt(hexToBytes(hiTok.slice(1, -1)));
      if (hi < lo || hi - lo > 0xffff) continue; // guard against absurd ranges

      if (dstTok.startsWith("[")) {
        const arr = parseArray(dstTok);
        for (let c = lo; c <= hi && c - lo < arr.length; c++) {
          map.set(c, utf16beToString(arr[c - lo]!));
        }
      } else {
        const dstBytes = hexToBytes(dstTok.slice(1, -1));
        // Base UTF-16 code units; increment the last unit per successive code.
        const units: number[] = [];
        for (let k = 0; k + 1 < dstBytes.length; k += 2) {
          units.push((dstBytes[k]! << 8) | dstBytes[k + 1]!);
        }
        if (units.length === 0 && dstBytes.length === 1) units.push(dstBytes[0]!);
        for (let c = lo; c <= hi; c++) {
          const offset = c - lo;
          const u = units.slice();
          if (u.length > 0) u[u.length - 1] = (u[u.length - 1]! + offset) & 0xffff;
          map.set(c, u.map((cu) => String.fromCharCode(cu)).join(""));
        }
      }
    }
  }

  return { map, lookup: (code) => map.get(code) };
}
