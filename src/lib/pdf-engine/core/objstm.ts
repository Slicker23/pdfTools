/**
 * Object stream (/Type /ObjStm) extraction.
 *
 * An object stream packs several indirect objects into one compressed stream.
 * The (already decoded) body starts with N pairs of "objNum offset", followed at
 * byte /First by the objects themselves (bare values, no "obj"/"endobj").
 */
import { Lexer } from "./cos/lexer";
import { ObjectParser } from "./cos/object-parser";
import type { CosObject } from "./cos/types";

export interface ObjStmObject {
  num: number;
  obj: CosObject;
}

/**
 * Parse all objects from a decoded object-stream body.
 * @param decoded fully decoded (inflated, unpredicted) stream bytes
 * @param n       /N  (number of objects)
 * @param first   /First (byte offset of the first object)
 */
export function parseObjectStream(decoded: Uint8Array, n: number, first: number): ObjStmObject[] {
  const header = new Lexer(decoded, 0);
  const nums: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < n; i++) {
    const numTok = header.nextToken();
    const offTok = header.nextToken();
    if (numTok.kind !== "int" || offTok.kind !== "int") {
      break;
    }
    nums.push(numTok.num!);
    offsets.push(offTok.num!);
  }

  const out: ObjStmObject[] = [];
  for (let i = 0; i < nums.length; i++) {
    const start = first + offsets[i]!;
    if (start < 0 || start > decoded.length) continue;
    const parser = new ObjectParser(decoded, start);
    out.push({ num: nums[i]!, obj: parser.parseObject() });
  }
  return out;
}
