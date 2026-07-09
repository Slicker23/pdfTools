/**
 * Classic (PDF <=1.4) cross-reference table parser.
 *
 *   xref
 *   0 6
 *   0000000000 65535 f
 *   0000000017 00000 n
 *   ...
 *   trailer
 *   << /Size 6 /Root 1 0 R >>
 */
import { matchAscii } from "../bytes";
import { Lexer } from "../cos/lexer";
import { ObjectParser } from "../cos/object-parser";
import { isDict, type CosDict } from "../cos/types";
import type { XrefEntry } from "./entries";

export interface ClassicXref {
  entries: XrefEntry[];
  trailer: CosDict;
}

/** Parse a classic xref section that begins (at `offset`) with the `xref` keyword. */
export function parseClassicXref(buf: Uint8Array, offset: number): ClassicXref {
  const lexer = new Lexer(buf, offset);
  lexer.skipWhitespaceAndComments();
  if (!matchAscii(buf, lexer.pos, "xref")) {
    throw new Error(`Expected "xref" at offset ${offset}`);
  }
  lexer.pos += 4;

  const entries: XrefEntry[] = [];

  for (;;) {
    lexer.skipWhitespaceAndComments();
    if (matchAscii(buf, lexer.pos, "trailer")) {
      lexer.pos += "trailer".length;
      break;
    }
    // Subsection header: "<start> <count>"
    const startTok = lexer.nextToken();
    if (startTok.kind !== "int") {
      // No more subsections and no trailer keyword - stop.
      break;
    }
    const countTok = lexer.nextToken();
    if (countTok.kind !== "int") {
      throw new Error(`Malformed xref subsection header at offset ${startTok.start}`);
    }
    const start = startTok.num!;
    const count = countTok.num!;

    for (let i = 0; i < count; i++) {
      const offTok = lexer.nextToken();
      const genTok = lexer.nextToken();
      const typeTok = lexer.nextToken();
      if (offTok.kind !== "int" || genTok.kind !== "int" || typeTok.kind !== "keyword") {
        throw new Error(`Malformed xref entry near offset ${offTok.start}`);
      }
      const num = start + i;
      if (typeTok.keyword === "n") {
        entries.push({ kind: "inuse", num, gen: genTok.num!, offset: offTok.num! });
      } else {
        entries.push({ kind: "free", num, gen: genTok.num! });
      }
    }
  }

  // Parse the trailer dictionary.
  const parser = new ObjectParser(buf, lexer.pos);
  const trailerObj = parser.parseObject();
  if (!isDict(trailerObj)) {
    throw new Error(`Classic xref trailer is not a dictionary at offset ${offset}`);
  }
  return { entries, trailer: trailerObj };
}
