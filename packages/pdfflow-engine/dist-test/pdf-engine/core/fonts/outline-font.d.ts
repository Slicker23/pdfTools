/**
 * Outline-capable font wrapper (M6).
 *
 * Combines M4 {@link Font} metrics/encoding with glyph outline extraction from
 * embedded font programs.
 */
import type { CosDocument } from "../document";
import { type CosDict } from "../cos/types";
import type { Font, StreamBytes } from "./types";
import type { GlyphOutline } from "./outlines/types";
export interface OutlineFont extends Font {
    hasOutlines: boolean;
    outlineForCode(code: number, unicode?: string): GlyphOutline | undefined;
    outlineForCid(cid: number): GlyphOutline | undefined;
    outlineForGlyph(gid: number): GlyphOutline | undefined;
}
export declare function loadOutlineFont(doc: CosDocument, dict: CosDict, getStreamBytes: StreamBytes, bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined): OutlineFont;
//# sourceMappingURL=outline-font.d.ts.map