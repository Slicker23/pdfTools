/**
 * Simple (single-byte) fonts: Type1, TrueType, Type3, MMType1 (ISO 32000-1 9.6).
 *
 * Widths come from `/Widths`+`/FirstChar` (with `/MissingWidth` from the font
 * descriptor), falling back to base-14 AFM metrics keyed by glyph name when the
 * font has no `/Widths`. Unicode comes from `/ToUnicode` when present, otherwise
 * from the resolved encoding via the Adobe Glyph List. Type3 widths are scaled
 * by `/FontMatrix` into the shared 1000-units-per-em convention.
 */
import type { CosDocument } from "../document";
import { type CosDict } from "../cos/types";
import type { Font, StreamBytes } from "./types";
export declare function loadSimpleFont(doc: CosDocument, dict: CosDict, getStreamBytes: StreamBytes): Font;
//# sourceMappingURL=simple-font.d.ts.map