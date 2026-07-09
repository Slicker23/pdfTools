/**
 * COS tokenizer. Turns a byte buffer into a stream of PDF tokens.
 *
 * The lexer is deliberately dumb about grammar: it emits numbers, strings,
 * names, delimiters and keywords. The object parser (object-parser.ts) assembles
 * these into COS objects, handling `int int R` references and stream bodies.
 */
import {
  CR,
  LF,
  hexVal,
  isDelimiter,
  isDigit,
  isHexDigit,
  isRegular,
  isWhitespace,
  bytesToLatin1,
} from "../bytes";

export type TokenKind =
  | "int"
  | "real"
  | "string"
  | "name"
  | "arrayOpen"
  | "arrayClose"
  | "dictOpen"
  | "dictClose"
  | "keyword"
  | "eof";

export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  /** int/real value */
  num?: number;
  /** original numeric text (for real round-tripping) */
  raw?: string;
  /** string bytes (decoded from literal/hex syntax) */
  bytes?: Uint8Array;
  /** true if a <hex> string */
  hex?: boolean;
  /** decoded name (without leading /) */
  name?: string;
  /** keyword text (obj, endobj, stream, R, true, false, null, ...) */
  keyword?: string;
}

export class Lexer {
  readonly buf: Uint8Array;
  pos: number;

  constructor(buf: Uint8Array, pos = 0) {
    this.buf = buf;
    this.pos = pos;
  }

  /** Skip whitespace and `%`-comments (comments run to end of line). */
  skipWhitespaceAndComments(): void {
    const { buf } = this;
    while (this.pos < buf.length) {
      const b = buf[this.pos]!;
      if (isWhitespace(b)) {
        this.pos++;
      } else if (b === 0x25) {
        // % comment
        this.pos++;
        while (this.pos < buf.length && buf[this.pos] !== LF && buf[this.pos] !== CR) {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  nextToken(): Token {
    this.skipWhitespaceAndComments();
    const { buf } = this;
    const start = this.pos;

    if (this.pos >= buf.length) {
      return { kind: "eof", start, end: start };
    }

    const b = buf[this.pos]!;

    // Arrays
    if (b === 0x5b) {
      this.pos++;
      return { kind: "arrayOpen", start, end: this.pos };
    }
    if (b === 0x5d) {
      this.pos++;
      return { kind: "arrayClose", start, end: this.pos };
    }

    // Dictionaries / hex strings both start with '<'
    if (b === 0x3c) {
      if (buf[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return { kind: "dictOpen", start, end: this.pos };
      }
      return this.readHexString(start);
    }
    if (b === 0x3e) {
      if (buf[this.pos + 1] === 0x3e) {
        this.pos += 2;
        return { kind: "dictClose", start, end: this.pos };
      }
      // Stray '>' - skip it defensively.
      this.pos++;
      return { kind: "keyword", keyword: ">", start, end: this.pos };
    }

    // Literal string
    if (b === 0x28) {
      return this.readLiteralString(start);
    }

    // Name
    if (b === 0x2f) {
      return this.readName(start);
    }

    // Number (int or real): digit, +, -, or leading '.'
    if (isDigit(b) || b === 0x2b || b === 0x2d || b === 0x2e) {
      return this.readNumber(start);
    }

    // PostScript function braces - emit as keywords (rare at COS level).
    if (b === 0x7b || b === 0x7d) {
      this.pos++;
      return { kind: "keyword", keyword: String.fromCharCode(b), start, end: this.pos };
    }

    // Keyword: run of regular characters.
    if (isRegular(b)) {
      return this.readKeyword(start);
    }

    // Unknown delimiter - skip one byte to make progress.
    this.pos++;
    return { kind: "keyword", keyword: String.fromCharCode(b), start, end: this.pos };
  }

  private readNumber(start: number): Token {
    const { buf } = this;
    let hasDot = false;
    let p = this.pos;
    while (p < buf.length) {
      const b = buf[p]!;
      if (isDigit(b) || b === 0x2b || b === 0x2d) {
        p++;
      } else if (b === 0x2e) {
        hasDot = true;
        p++;
      } else {
        break;
      }
    }
    const raw = bytesToLatin1(buf.subarray(this.pos, p));
    this.pos = p;
    if (hasDot) {
      const value = parseFloat(raw);
      return {
        kind: "real",
        num: Number.isFinite(value) ? value : 0,
        raw,
        start,
        end: p,
      };
    }
    const value = parseInt(raw, 10);
    return {
      kind: "int",
      num: Number.isFinite(value) ? value : 0,
      raw,
      start,
      end: p,
    };
  }

  private readName(start: number): Token {
    const { buf } = this;
    let p = this.pos + 1; // skip '/'
    const out: number[] = [];
    while (p < buf.length) {
      const b = buf[p]!;
      if (!isRegular(b)) break;
      if (b === 0x23 && p + 2 < buf.length && isHexDigit(buf[p + 1]!) && isHexDigit(buf[p + 2]!)) {
        out.push(hexVal(buf[p + 1]!) * 16 + hexVal(buf[p + 2]!));
        p += 3;
      } else {
        out.push(b);
        p++;
      }
    }
    this.pos = p;
    return {
      kind: "name",
      name: bytesToLatin1(Uint8Array.from(out)),
      start,
      end: p,
    };
  }

  private readKeyword(start: number): Token {
    const { buf } = this;
    let p = this.pos;
    while (p < buf.length && isRegular(buf[p]!)) p++;
    const keyword = bytesToLatin1(buf.subarray(this.pos, p));
    this.pos = p;
    return { kind: "keyword", keyword, start, end: p };
  }

  private readHexString(start: number): Token {
    const { buf } = this;
    let p = this.pos + 1; // skip '<'
    const out: number[] = [];
    let hi = -1;
    while (p < buf.length) {
      const b = buf[p]!;
      if (b === 0x3e) {
        p++;
        break;
      }
      if (isWhitespace(b)) {
        p++;
        continue;
      }
      if (isHexDigit(b)) {
        if (hi < 0) {
          hi = hexVal(b);
        } else {
          out.push(hi * 16 + hexVal(b));
          hi = -1;
        }
      }
      p++;
    }
    if (hi >= 0) out.push(hi * 16); // odd nibble -> pad low nibble with 0
    this.pos = p;
    return {
      kind: "string",
      bytes: Uint8Array.from(out),
      hex: true,
      start,
      end: p,
    };
  }

  private readLiteralString(start: number): Token {
    const { buf } = this;
    let p = this.pos + 1; // skip '('
    const out: number[] = [];
    let depth = 1;
    while (p < buf.length) {
      const b = buf[p]!;
      if (b === 0x5c) {
        // backslash escape
        p++;
        if (p >= buf.length) break;
        const e = buf[p]!;
        switch (e) {
          case 0x6e: // n
            out.push(LF);
            p++;
            break;
          case 0x72: // r
            out.push(CR);
            p++;
            break;
          case 0x74: // t
            out.push(0x09);
            p++;
            break;
          case 0x62: // b
            out.push(0x08);
            p++;
            break;
          case 0x66: // f
            out.push(0x0c);
            p++;
            break;
          case 0x28: // (
            out.push(0x28);
            p++;
            break;
          case 0x29: // )
            out.push(0x29);
            p++;
            break;
          case 0x5c: // backslash
            out.push(0x5c);
            p++;
            break;
          case CR:
            // line continuation: \<CRLF> or \<CR>
            p++;
            if (buf[p] === LF) p++;
            break;
          case LF:
            p++; // line continuation: \<LF>
            break;
          default:
            if (e >= 0x30 && e <= 0x37) {
              // up to 3 octal digits
              let val = 0;
              let n = 0;
              while (n < 3 && p < buf.length && buf[p]! >= 0x30 && buf[p]! <= 0x37) {
                val = val * 8 + (buf[p]! - 0x30);
                p++;
                n++;
              }
              out.push(val & 0xff);
            } else {
              // unknown escape: keep the char literally
              out.push(e);
              p++;
            }
            break;
        }
      } else if (b === 0x28) {
        depth++;
        out.push(b);
        p++;
      } else if (b === 0x29) {
        depth--;
        if (depth === 0) {
          p++;
          break;
        }
        out.push(b);
        p++;
      } else if (b === CR) {
        // Unescaped EOL normalizes to LF; CRLF collapses to one LF.
        out.push(LF);
        p++;
        if (buf[p] === LF) p++;
      } else {
        out.push(b);
        p++;
      }
    }
    this.pos = p;
    return {
      kind: "string",
      bytes: Uint8Array.from(out),
      hex: false,
      start,
      end: p,
    };
  }
}
