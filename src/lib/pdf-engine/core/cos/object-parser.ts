/**
 * Assembles COS objects from a token stream.
 *
 * Handles the two context-sensitive parts of PDF syntax the lexer cannot:
 *  - `<int> <int> R`   -> indirect reference
 *  - `<< dict >> stream ... endstream` -> stream object (with length resolution)
 */
import { CR, LF, matchAscii, isWhitespace } from "../bytes";
import {
  COS_NULL,
  cosArray,
  cosBool,
  cosDict,
  cosInt,
  cosName,
  cosReal,
  cosRef,
  cosStream,
  cosString,
  dictGet,
  isInt,
  isRef,
  type CosDict,
  type CosObject,
} from "./types";
import { Lexer, type Token } from "./lexer";

/** Resolves an indirect reference (used for indirect /Length on streams). */
export type RefResolver = (num: number, gen: number) => CosObject | undefined;

export interface IndirectObject {
  num: number;
  gen: number;
  obj: CosObject;
  /** byte offset of the start of "<num> <gen> obj" */
  start: number;
  /** byte offset just past "endobj" (or best effort) */
  end: number;
}

/** Guards against stack overflow from pathologically nested arrays/dicts. */
const MAX_NESTING = 256;

export class ObjectParser {
  private lexer: Lexer;
  private lookahead: Token[] = [];
  private resolver?: RefResolver;
  private depth = 0;

  constructor(buf: Uint8Array, pos = 0, resolver?: RefResolver) {
    this.lexer = new Lexer(buf, pos);
    this.resolver = resolver;
  }

  get position(): number {
    return this.lookahead.length ? this.lookahead[0]!.start : this.lexer.pos;
  }

  private peek(i = 0): Token {
    while (this.lookahead.length <= i) {
      this.lookahead.push(this.lexer.nextToken());
    }
    return this.lookahead[i]!;
  }

  private take(): Token {
    return this.lookahead.shift() ?? this.lexer.nextToken();
  }

  /**
   * Parse "<num> <gen> obj <value> endobj" at the current position.
   * Throws if the header is malformed.
   */
  parseIndirectObject(): IndirectObject {
    const start = this.position;
    const numTok = this.take();
    const genTok = this.take();
    const objTok = this.take();
    if (
      numTok.kind !== "int" ||
      genTok.kind !== "int" ||
      objTok.kind !== "keyword" ||
      objTok.keyword !== "obj"
    ) {
      throw new Error(
        `Expected "<num> <gen> obj" at offset ${start}, got ${numTok.kind}/${genTok.kind}/${objTok.keyword ?? objTok.kind}`
      );
    }
    const obj = this.parseObject();
    // Consume optional trailing "endobj".
    const t = this.peek();
    let end = this.lexer.pos;
    if (t.kind === "keyword" && t.keyword === "endobj") {
      this.take();
      end = t.end;
    }
    return { num: numTok.num!, gen: genTok.num!, obj, start, end };
  }

  /** Parse a single COS value at the current position. */
  parseObject(): CosObject {
    const t = this.peek();
    switch (t.kind) {
      case "int":
        return this.parseNumberOrRef();
      case "real":
        this.take();
        return cosReal(t.num!, t.raw);
      case "string":
        this.take();
        return cosString(t.bytes!, t.hex);
      case "name":
        this.take();
        return cosName(t.name!);
      case "arrayOpen":
        return this.parseArray();
      case "dictOpen":
        return this.parseDictOrStream();
      case "keyword":
        return this.parseKeyword();
      case "eof":
        throw new Error(`Unexpected EOF while parsing object at offset ${t.start}`);
      default:
        throw new Error(`Unexpected token ${t.kind} at offset ${t.start}`);
    }
  }

  private parseKeyword(): CosObject {
    const t = this.take();
    switch (t.keyword) {
      case "true":
        return cosBool(true);
      case "false":
        return cosBool(false);
      case "null":
        return COS_NULL;
      default:
        // Unexpected keyword in value position - treat as null to stay resilient.
        return COS_NULL;
    }
  }

  private parseNumberOrRef(): CosObject {
    const a = this.peek(0);
    const b = this.peek(1);
    const c = this.peek(2);
    if (
      a.kind === "int" &&
      b.kind === "int" &&
      c.kind === "keyword" &&
      c.keyword === "R"
    ) {
      this.take();
      this.take();
      this.take();
      return cosRef(a.num!, b.num!);
    }
    this.take();
    return cosInt(a.num!);
  }

  private parseArray(): CosObject {
    if (++this.depth > MAX_NESTING) {
      throw new Error(`COS nesting exceeds ${MAX_NESTING} (possible malformed input)`);
    }
    try {
      return this.parseArrayInner();
    } finally {
      this.depth--;
    }
  }

  private parseArrayInner(): CosObject {
    this.take(); // [
    const items: CosObject[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === "arrayClose") {
        this.take();
        break;
      }
      if (t.kind === "eof") {
        break;
      }
      items.push(this.parseObject());
    }
    return cosArray(items);
  }

  private parseDict(): CosDict {
    if (++this.depth > MAX_NESTING) {
      throw new Error(`COS nesting exceeds ${MAX_NESTING} (possible malformed input)`);
    }
    try {
      return this.parseDictInner();
    } finally {
      this.depth--;
    }
  }

  private parseDictInner(): CosDict {
    this.take(); // <<
    const map = new Map<string, CosObject>();
    for (;;) {
      const t = this.peek();
      if (t.kind === "dictClose") {
        this.take();
        break;
      }
      if (t.kind === "eof") {
        break;
      }
      if (t.kind !== "name") {
        // Skip stray tokens defensively (malformed dicts).
        this.take();
        continue;
      }
      this.take();
      const value = this.parseObject();
      map.set(t.name!, value);
    }
    return cosDict(map);
  }

  private parseDictOrStream(): CosObject {
    const dict = this.parseDict();
    const t = this.peek();
    if (t.kind === "keyword" && t.keyword === "stream") {
      this.take(); // consume "stream"
      // Discard any further lookahead: raw stream bytes begin right after the
      // EOL that follows "stream". We must read straight from the buffer.
      this.lookahead = [];
      const raw = this.readStreamBody(t.end, dict);
      return cosStream(dict, raw);
    }
    return dict;
  }

  private readStreamBody(afterStreamKeyword: number, dict: CosDict): Uint8Array {
    const buf = this.lexer.buf;
    // "stream" must be followed by CRLF or LF; be lenient about a lone CR.
    let dataStart = afterStreamKeyword;
    if (buf[dataStart] === CR && buf[dataStart + 1] === LF) {
      dataStart += 2;
    } else if (buf[dataStart] === LF) {
      dataStart += 1;
    } else if (buf[dataStart] === CR) {
      dataStart += 1;
    }

    // Try the declared /Length first (direct, or indirect via resolver).
    const length = this.resolveLength(dict);
    if (length != null && length >= 0 && dataStart + length <= buf.length) {
      const candidateEnd = dataStart + length;
      if (this.endstreamFollows(candidateEnd)) {
        this.lexer.pos = this.skipToAfterEndstream(candidateEnd);
        return buf.subarray(dataStart, candidateEnd);
      }
    }

    // Fallback: scan for "endstream".
    const idx = this.findEndstream(dataStart);
    let dataEnd = idx < 0 ? buf.length : idx;
    // Strip the single EOL that precedes "endstream" (not part of the data).
    if (dataEnd > dataStart && buf[dataEnd - 1] === LF) dataEnd--;
    if (dataEnd > dataStart && buf[dataEnd - 1] === CR) dataEnd--;
    this.lexer.pos = idx < 0 ? buf.length : this.skipToAfterEndstream(idx);
    return buf.subarray(dataStart, dataEnd);
  }

  private resolveLength(dict: CosDict): number | undefined {
    const len = dictGet(dict, "Length");
    if (isInt(len)) return len.value;
    if (isRef(len) && this.resolver) {
      const resolved = this.resolver(len.num, len.gen);
      if (isInt(resolved)) return resolved.value;
    }
    return undefined;
  }

  private endstreamFollows(pos: number): boolean {
    const buf = this.lexer.buf;
    let p = pos;
    while (p < buf.length && isWhitespace(buf[p]!)) p++;
    return matchAscii(buf, p, "endstream");
  }

  private skipToAfterEndstream(fromDataEnd: number): number {
    const buf = this.lexer.buf;
    let p = fromDataEnd;
    while (p < buf.length && isWhitespace(buf[p]!)) p++;
    if (matchAscii(buf, p, "endstream")) p += "endstream".length;
    return p;
  }

  private findEndstream(from: number): number {
    const buf = this.lexer.buf;
    for (let i = from; i <= buf.length - 9; i++) {
      if (buf[i] === 0x65 && matchAscii(buf, i, "endstream")) return i;
    }
    return -1;
  }
}

/** Convenience: parse a single value from a byte buffer. */
export function parseCosObject(buf: Uint8Array, pos = 0): CosObject {
  return new ObjectParser(buf, pos).parseObject();
}
