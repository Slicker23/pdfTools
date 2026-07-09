import type { SpanSource } from "../content/types";
/** A byte-range replacement within one decoded content stream. */
export interface StreamEdit {
    regionStart: number;
    regionEnd: number;
    replacement: Uint8Array;
}
/**
 * Build the replacement operator bytes for a run.
 *
 * @param newBytes encoded character codes (empty for deletion)
 * @param comp     compensating TJ adjustment (thousandths of text space); 0 omits
 */
export declare function buildShowReplacement(source: Pick<SpanSource, "op" | "aw" | "ac">, newBytes: Uint8Array, comp: number): Uint8Array;
/** Apply non-overlapping byte-range replacements to a decoded content stream. */
export declare function spliceStream(decoded: Uint8Array, edits: StreamEdit[]): Uint8Array;
//# sourceMappingURL=edit-run.d.ts.map