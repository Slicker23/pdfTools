/**
 * Content-stream tokenizer.
 *
 * Reuses the COS byte lexer (../cos/lexer) and groups operand tokens up to each
 * operator keyword, yielding one operation at a time. Handles TJ arrays and
 * BDC/DP dictionaries as operands, and skips inline images (BI ... ID <bytes>
 * EI) in a binary-safe way so their raw data never corrupts the token stream.
 */
import { isDelimiter, isWhitespace } from "../bytes";
import { Lexer, type Token } from "../cos/lexer";
import {
  COS_NULL,
  cosArray,
  cosBool,
  cosDict,
  cosInt,
  cosName,
  cosReal,
  cosString,
  type CosObject,
} from "../cos/types";

export interface ContentOp {
  op: string;
  operands: CosObject[];
  /** Byte offset of the operator keyword in the tokenized buffer. */
  opStart: number;
  /** Byte offset just past the operator keyword. */
  opEnd: number;
  /** Byte offset of the first operand token, or -1 if the operator has none. */
  operandsStart: number;
}

function tokenToOperand(t: Token, lexer: Lexer): CosObject | undefined {
  switch (t.kind) {
    case "int":
      return cosInt(t.num!);
    case "real":
      return cosReal(t.num!, t.raw);
    case "string":
      return cosString(t.bytes!, t.hex);
    case "name":
      return cosName(t.name!);
    case "arrayOpen":
      return readArray(lexer);
    case "dictOpen":
      return readDict(lexer);
    case "keyword":
      if (t.keyword === "true") return cosBool(true);
      if (t.keyword === "false") return cosBool(false);
      if (t.keyword === "null") return COS_NULL;
      return undefined;
    default:
      return undefined;
  }
}

function readArray(lexer: Lexer): CosObject {
  const items: CosObject[] = [];
  for (;;) {
    const t = lexer.nextToken();
    if (t.kind === "arrayClose" || t.kind === "eof") break;
    const v = tokenToOperand(t, lexer);
    if (v) items.push(v);
  }
  return cosArray(items);
}

function readDict(lexer: Lexer): CosObject {
  const map = new Map<string, CosObject>();
  for (;;) {
    const t = lexer.nextToken();
    if (t.kind === "dictClose" || t.kind === "eof") break;
    if (t.kind !== "name") continue; // skip stray tokens defensively
    const key = t.name!;
    const value = tokenToOperand(lexer.nextToken(), lexer);
    map.set(key, value ?? COS_NULL);
  }
  return cosDict(map);
}

/** Skip an inline image: from just after `BI` to just after its `EI`. */
function skipInlineImage(lexer: Lexer): void {
  // Consume the params (name/value pairs) up to the ID keyword.
  for (;;) {
    const t = lexer.nextToken();
    if (t.kind === "eof") return;
    if (t.kind === "keyword" && t.keyword === "ID") break;
  }
  const buf = lexer.buf;
  let p = lexer.pos;
  if (p < buf.length && isWhitespace(buf[p]!)) p++; // one whitespace after ID
  // Find the image terminator. Preferred: an `EI` delimited by whitespace before
  // AND whitespace/delimiter/EOF after (ISO 32000-1, 8.9.7). Some producers omit
  // the whitespace *before* EI (binary data ending on any byte), so as a recovery
  // fallback we accept the first `EI` that is at least followed by a delimiter,
  // rather than running to EOF and swallowing every following operator.
  let strictEnd = -1;
  let fallbackEnd = -1;
  while (p < buf.length) {
    if (buf[p] === 0x45 /* E */ && buf[p + 1] === 0x49 /* I */) {
      const afterIdx = p + 2;
      const after =
        afterIdx >= buf.length || isWhitespace(buf[afterIdx]!) || isDelimiter(buf[afterIdx]!);
      if (after) {
        const before = p === 0 || isWhitespace(buf[p - 1]!);
        if (before) {
          strictEnd = p + 2;
          break;
        }
        if (fallbackEnd < 0) fallbackEnd = p + 2;
      }
    }
    p++;
  }
  const end = strictEnd >= 0 ? strictEnd : fallbackEnd >= 0 ? fallbackEnd : buf.length;
  lexer.pos = end;
}

/** Yield each content-stream operation (operator + its operands) in order. */
export function* tokenizeContent(bytes: Uint8Array): Generator<ContentOp> {
  const lexer = new Lexer(bytes, 0);
  let operands: CosObject[] = [];
  let operandsStart = -1;
  for (;;) {
    const t = lexer.nextToken();
    if (t.kind === "eof") break;

    if (t.kind === "keyword") {
      const kw = t.keyword!;
      if (kw === "true") {
        if (operandsStart < 0) operandsStart = t.start;
        operands.push(cosBool(true));
        continue;
      }
      if (kw === "false") {
        if (operandsStart < 0) operandsStart = t.start;
        operands.push(cosBool(false));
        continue;
      }
      if (kw === "null") {
        if (operandsStart < 0) operandsStart = t.start;
        operands.push(COS_NULL);
        continue;
      }
      if (kw === "BI") {
        skipInlineImage(lexer);
        operands = [];
        operandsStart = -1;
        continue;
      }
      yield { op: kw, operands, opStart: t.start, opEnd: t.end, operandsStart };
      operands = [];
      operandsStart = -1;
      continue;
    }

    if (t.kind === "arrayClose" || t.kind === "dictClose") continue; // stray close
    const start = t.start;
    const operand = tokenToOperand(t, lexer);
    if (operand) {
      if (operandsStart < 0) operandsStart = start;
      operands.push(operand);
    }
  }
}
