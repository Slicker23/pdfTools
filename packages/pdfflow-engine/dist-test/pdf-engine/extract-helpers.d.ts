import type { PdfEditBBox, PdfEditFont } from "@/lib/pdf/edit-model";
import { looksGarbled } from "@/lib/pdf/edit-pickup";
export { looksGarbled };
export interface CharSpan {
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    baseline: number;
    fontSize: number;
    fontKey: string;
    fontName: string;
    bold: boolean;
    italic: boolean;
    color: string;
}
export declare function parseFontName(raw: string): {
    name: string;
    bold: boolean;
    italic: boolean;
};
export declare function rgbaToHex(r: number, g: number, b: number): string;
export declare function groupByBaseline(spans: CharSpan[]): CharSpan[][];
export declare function stylesMatch(a: CharSpan, b: CharSpan): boolean;
export declare function mergeSpans(spans: CharSpan[], options?: {
    aggressiveWordSpaces?: boolean;
}): {
    text: string;
    bbox: PdfEditBBox;
    font: PdfEditFont;
    baseline: number;
};
export declare function splitLineAtColumnGaps(spans: CharSpan[]): CharSpan[][];
export declare function shouldUseBounded(spans: CharSpan[], mergedText: string): boolean;
//# sourceMappingURL=extract-helpers.d.ts.map