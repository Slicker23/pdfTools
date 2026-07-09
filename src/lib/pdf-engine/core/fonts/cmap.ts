/**
 * CMap parsing for Type0 fonts (ISO 32000-1, 9.7.5).
 *
 * A CMap maps a sequence of character-code bytes to CIDs. We support:
 *   - the predefined `Identity-H` / `Identity-V` CMaps (2-byte, CID = code), and
 *   - embedded CMap streams (`codespacerange`, `cidrange`, `cidchar`).
 *
 * Other predefined CMaps (Adobe-Japan1 etc.) are deferred; they fall back to a
 * 2-byte Identity decode so advances/positioning still work, only Unicode via a
 * predefined CID->Unicode table is unavailable (that needs /ToUnicode instead).
 */

export interface DecodedCode {
  /** Integer value of the consumed byte sequence. */
  code: number;
  /** Mapped CID. */
  cid: number;
  /** Number of bytes consumed. */
  byteLen: number;
}

export interface CMap {
  isIdentity: boolean;
  /** Writing mode: 0 = horizontal, 1 = vertical. */
  wmode: number;
  next(bytes: Uint8Array, pos: number): DecodedCode;
}

/** Predefined Identity-H / Identity-V: 2-byte codes, CID = code. */
export function identityCMap(wmode = 0): CMap {
  return {
    isIdentity: true,
    wmode,
    next(bytes, pos) {
      const hi = bytes[pos] ?? 0;
      const lo = bytes[pos + 1] ?? 0;
      const code = (hi << 8) | lo;
      return { code, cid: code, byteLen: 2 };
    },
  };
}

/** Resolve a predefined CMap by name; unknown non-Identity names -> undefined. */
export function predefinedCMap(name: string): CMap | undefined {
  if (name === "Identity-H" || name === "Identity") return identityCMap(0);
  if (name === "Identity-V") return identityCMap(1);
  return undefined;
}

interface CodespaceRange {
  len: number;
  lo: Uint8Array;
  hi: Uint8Array;
}
interface CidRange {
  len: number;
  lo: number;
  hi: number;
  cid: number;
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
function hexTokens(body: string): string[] {
  const out: string[] = [];
  const re = /<([0-9A-Fa-f\s]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(m[1]!);
  return out;
}

/** Parse an embedded CMap stream body into a decoder. */
export function parseCMapStream(bytes: Uint8Array): CMap {
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]!);

  const codespaces: CodespaceRange[] = [];
  const csRe = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let block: RegExpExecArray | null;
  while ((block = csRe.exec(text))) {
    const toks = hexTokens(block[1]!);
    for (let i = 0; i + 1 < toks.length; i += 2) {
      const lo = hexToBytes(toks[i]!);
      const hi = hexToBytes(toks[i + 1]!);
      const len = Math.max(lo.length, hi.length) || 1;
      codespaces.push({ len, lo, hi });
    }
  }

  const cidChars = new Map<number, number>();
  const ccRe = /begincidchar([\s\S]*?)endcidchar/g;
  while ((block = ccRe.exec(text))) {
    const body = block[1]!;
    const re = /<([0-9A-Fa-f\s]*)>\s+(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) cidChars.set(bytesToInt(hexToBytes(m[1]!)), Number(m[2]));
  }

  const cidRanges: CidRange[] = [];
  const crRe = /begincidrange([\s\S]*?)endcidrange/g;
  while ((block = crRe.exec(text))) {
    const body = block[1]!;
    const re = /<([0-9A-Fa-f\s]*)>\s*<([0-9A-Fa-f\s]*)>\s+(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const loB = hexToBytes(m[1]!);
      const hiB = hexToBytes(m[2]!);
      cidRanges.push({
        len: Math.max(loB.length, hiB.length) || 1,
        lo: bytesToInt(loB),
        hi: bytesToInt(hiB),
        cid: Number(m[3]),
      });
    }
  }

  // Distinct codespace byte lengths, ascending (drives greedy code reading).
  const lens = Array.from(new Set(codespaces.map((c) => c.len))).sort((a, b) => a - b);
  const minLen = lens[0] ?? 2;

  const withinCodespace = (bytes: Uint8Array, pos: number, len: number): boolean => {
    for (const cs of codespaces) {
      if (cs.len !== len) continue;
      let ok = true;
      for (let i = 0; i < len; i++) {
        const b = bytes[pos + i] ?? 0;
        const lo = cs.lo[i] ?? 0;
        const hi = cs.hi[i] ?? 0;
        if (b < lo || b > hi) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };

  const mapCid = (code: number, len: number): number => {
    const direct = cidChars.get(code);
    if (direct !== undefined) return direct;
    for (const r of cidRanges) {
      if (r.len === len && code >= r.lo && code <= r.hi) return r.cid + (code - r.lo);
    }
    return code; // Identity fallback for unmapped codes.
  };

  return {
    isIdentity: false,
    wmode: 0,
    next(bytes, pos) {
      for (const len of lens) {
        if (pos + len > bytes.length) continue;
        if (withinCodespace(bytes, pos, len)) {
          const code = bytesToInt(bytes.subarray(pos, pos + len));
          return { code, cid: mapCid(code, len), byteLen: len };
        }
      }
      // No codespace matched: consume the shortest known length (>=1).
      const len = Math.min(minLen, Math.max(1, bytes.length - pos));
      const code = bytesToInt(bytes.subarray(pos, pos + len));
      return { code, cid: mapCid(code, len), byteLen: len };
    },
  };
}
