import { type FontFamily } from "./fonts";
export type WeightConfidence = "bold" | "regular" | "ambiguous";
export interface FontKeyMeta {
    fontKey: string;
    styleFamily?: string;
    fontSize: number;
    confidence: WeightConfidence;
    bold: boolean;
    strokeScores: number[];
}
/** Register PDF font keys encountered on a page. */
export declare function createFontKeyRegistry(): Map<string, FontKeyMeta>;
export declare function registerFontKey(registry: Map<string, FontKeyMeta>, fontKey: string, styleFamily: string | undefined, fontSize: number): void;
export declare function recordStrokeScore(registry: Map<string, FontKeyMeta>, fontKey: string, strokeScore: number): void;
/** Resolve bold for every PDF font key using name hints + canvas stroke scores. */
export declare function finalizeFontWeightMap(registry: Map<string, FontKeyMeta>): Map<string, boolean>;
export declare function isBoldForFontKey(weightMap: Map<string, boolean>, fontKey: string, fallback?: boolean): boolean;
export interface RawFontSpan {
    fontKey: string;
    styleFamily?: string;
    fontSize: number;
    bold: boolean;
}
/** Seed registry from raw glyph spans before grouping. */
export declare function seedRegistryFromRaw(registry: Map<string, FontKeyMeta>, spans: RawFontSpan[]): void;
/** Build a quick name-only weight map (used before canvas calibration). */
export declare function initialWeightMap(registry: Map<string, FontKeyMeta>): Map<string, boolean>;
export type { FontFamily };
//# sourceMappingURL=font-weight.d.ts.map