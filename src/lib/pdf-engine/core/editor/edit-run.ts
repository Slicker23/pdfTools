/**
 * Content-stream run editor (M5).
 *
 * Rewrites a single text-showing operator (`Tj`/`TJ`/`'`/`"`) in a decoded
 * content stream, replacing its shown string with freshly encoded character
 * codes. Every operator is rewritten to the canonical `[<hex> comp] TJ` form
 * (preserving the line-move of `'`/`"` and the spacing operands of `"`), where
 * `comp` is a compensating TJ adjustment that keeps the pen's end position
 * unchanged so following content is not shifted. Codes are emitted as a hex
 * string so arbitrary byte values (including 2-byte Type0 codes) are safe.
 */
import { asciiBytes, concatBytes } from "../bytes";
import type { SpanSource } from "../content/types";

/** A byte-range replacement within one decoded content stream. */
export interface StreamEdit {
  regionStart: number;
  regionEnd: number;
  replacement: Uint8Array;
}

function hexString(bytes: Uint8Array): string {
  let s = "<";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s + ">";
}

/**
 * Build the replacement operator bytes for a run.
 *
 * @param newBytes encoded character codes (empty for deletion)
 * @param comp     compensating TJ adjustment (thousandths of text space); 0 omits
 */
export function buildShowReplacement(
  source: Pick<SpanSource, "op" | "aw" | "ac">,
  newBytes: Uint8Array,
  comp: number
): Uint8Array {
  const compStr = comp !== 0 ? ` ${Math.round(comp)}` : "";
  const array = `[${hexString(newBytes)}${compStr}] TJ`;
  switch (source.op) {
    case "'":
      // `(str) '` == move to next line, then show.
      return asciiBytes(`T* ${array}`);
    case '"':
      // `aw ac (str) "` == set word/char spacing, next line, then show.
      return asciiBytes(`${source.aw ?? 0} Tw ${source.ac ?? 0} Tc T* ${array}`);
    default:
      // Tj / TJ.
      return asciiBytes(array);
  }
}

/** Apply non-overlapping byte-range replacements to a decoded content stream. */
export function spliceStream(decoded: Uint8Array, edits: StreamEdit[]): Uint8Array {
  const sorted = [...edits].sort((a, b) => a.regionStart - b.regionStart);
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const e of sorted) {
    if (e.regionStart < cursor) {
      throw new Error("overlapping content-stream edits");
    }
    parts.push(decoded.subarray(cursor, e.regionStart));
    parts.push(e.replacement);
    cursor = e.regionEnd;
  }
  parts.push(decoded.subarray(cursor));
  return concatBytes(parts);
}
