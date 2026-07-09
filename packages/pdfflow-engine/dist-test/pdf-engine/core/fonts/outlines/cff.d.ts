/**
 * Compact Font Format (CFF) container parser (M6).
 *
 * Parses the CFF INDEX/DICT structure and exposes CharStrings for Type2
 * interpretation. Handles raw CFF (FontFile3) and sfnt with `CFF ` table.
 */
import { type TrueTypeFace } from "./ttf";
export interface CffFont {
    charStrings: Uint8Array[];
    globalSubrs: Uint8Array[];
    defaultWidthX: number;
    nominalWidthX: number;
    nGlyphs: number;
}
export declare function extractCffBytes(data: Uint8Array): Uint8Array | undefined;
export declare function parseCff(data: Uint8Array): CffFont | undefined;
export declare function parseFontProgram(data: Uint8Array): {
    kind: "truetype";
    face: TrueTypeFace;
} | {
    kind: "cff";
    cff: CffFont;
} | undefined;
//# sourceMappingURL=cff.d.ts.map