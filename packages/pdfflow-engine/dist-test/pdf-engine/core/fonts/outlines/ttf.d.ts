/**
 * Minimal TrueType / OpenType `glyf` outline parser (M6).
 *
 * Reads sfnt-wrapped fonts (FontFile2 or sfnt-in-FontFile3). Supports simple
 * and composite glyphs, cmap formats 4 and 12.
 */
import type { GlyphOutline } from "./types";
export interface TrueTypeFace {
    unitsPerEm: number;
    numGlyphs: number;
    locaShort: boolean;
    /** Unicode code point -> glyph index. */
    cmap: Map<number, number>;
    /** Glyph name -> glyph index (from post table, when present). */
    postNames: Map<string, number>;
    getGlyphOutline(gid: number): GlyphOutline | undefined;
    gidForUnicode(cp: number): number | undefined;
    gidForName(name: string): number | undefined;
}
/** Parse an sfnt-wrapped TrueType/OpenType font buffer. */
export declare function parseTrueType(data: Uint8Array): TrueTypeFace | undefined;
//# sourceMappingURL=ttf.d.ts.map