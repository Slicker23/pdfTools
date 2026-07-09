/**
 * Cross-reference chain builder.
 *
 * Locates `startxref`, then walks the whole history of xref sections (classic
 * tables and/or xref streams), following /Prev and hybrid /XRefStm links.
 * Newer sections take precedence: an object number already resolved by a newer
 * section is never overwritten by an older one.
 */
import type { InflateFn } from "../platform";
import type { XrefResult } from "./entries";
/** Read the byte offset referenced by the final `startxref` in the file. */
export declare function readStartXref(buf: Uint8Array): number;
export declare function buildXref(buf: Uint8Array, inflate: InflateFn): Promise<XrefResult>;
//# sourceMappingURL=build.d.ts.map