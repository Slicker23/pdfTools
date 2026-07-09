/**
 * Cross-reference stream parser (PDF 1.5+).
 *
 * An xref stream is an indirect object whose dict has /Type /XRef and whose
 * (Flate-compressed, usually PNG-predicted) body encodes fixed-width entries
 * described by /W, /Index and /Size.
 */
import type { InflateFn } from "../platform";
import { type CosDict } from "../cos/types";
import type { XrefEntry } from "./entries";
export interface XrefStreamResult {
    entries: XrefEntry[];
    trailer: CosDict;
}
/** Parse an xref stream located at `offset` (start of "<num> <gen> obj"). */
export declare function parseXrefStream(buf: Uint8Array, offset: number, inflate: InflateFn): Promise<XrefStreamResult>;
//# sourceMappingURL=stream.d.ts.map