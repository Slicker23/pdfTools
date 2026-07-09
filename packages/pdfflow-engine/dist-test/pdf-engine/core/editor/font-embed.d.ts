/**
 * Page font resource matching for native font-family / bold / italic swaps (M9).
 *
 * Prefers reusing fonts already registered on the page `/Resources/Font` before
 * embedding new programs.
 */
import type { CosDocument, PageNode } from "../document";
import { type CosDict } from "../cos/types";
import type { Font } from "../fonts/types";
import type { PdfEditFont } from "@/lib/pdf/edit-model";
export interface MatchedPageFont {
    fontRef: string;
    fontDict: CosDict;
}
export declare function parseFontVariant(baseFont: string): {
    name: string;
    bold: boolean;
    italic: boolean;
};
export declare function fontMatchesTarget(baseFont: string, target: PdfEditFont): boolean;
/** Find a page `/Font` resource matching the requested style variant. */
export declare function matchPageFontRef(doc: CosDocument, page: PageNode, target: PdfEditFont): Promise<MatchedPageFont | undefined>;
/** Resolve a usable font for edits; currently matches existing page resources only. */
export declare function ensureFontResource(doc: CosDocument, page: PageNode, target: PdfEditFont): Promise<{
    fontRef: string;
    font: Font;
} | undefined>;
/** Page `/Resources/Font` entry that encodes all of `text` (never form-local refs). */
export declare function resolveInsertFontForPage(doc: CosDocument, page: PageNode, text: string, target: PdfEditFont): Promise<{
    fontRef: string;
    font: Font;
} | undefined>;
/** Base-14 Type1 font dict for native insert (WinAnsi, full ASCII). */
export declare function buildStandardInsertFontDict(baseFont?: string): CosDict;
//# sourceMappingURL=font-embed.d.ts.map