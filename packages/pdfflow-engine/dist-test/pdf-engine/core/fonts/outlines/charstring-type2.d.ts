/**
 * CFF Type2 charstring interpreter (M6).
 *
 * Decodes Type2 outline charstrings into {@link GlyphOutline} path segments.
 */
import type { GlyphOutline } from "./types";
import type { CffFont } from "./cff";
export declare function interpretType2Charstring(data: Uint8Array, subrs?: Uint8Array[], nominalWidthX?: number): GlyphOutline;
export declare function cffGlyphOutline(cff: CffFont, gid: number): GlyphOutline;
//# sourceMappingURL=charstring-type2.d.ts.map