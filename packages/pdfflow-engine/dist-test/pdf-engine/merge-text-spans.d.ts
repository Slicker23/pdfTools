/**
 * Post-extract merge: combine adjacent same-line text runs into one logical block.
 *
 * PDF authors often emit one show operator per glyph cluster (e.g. "T" + "ransport").
 * We merge runs that share baseline/style and are close horizontally so the editor
 * shows one selection box per word/phrase while preserving per-run locators.
 */
import type { TextSpan } from "./core";
export declare function spanRightEdge(span: TextSpan): number;
export declare function spanLeftEdge(span: TextSpan): number;
/** True when two spans can be treated as one visual word/phrase fragment. */
export declare function spansMergeable(a: TextSpan, b: TextSpan): boolean;
/** Group editable spans on one page into merge candidates (each group → one block). */
export declare function groupMergeableSpans(spans: TextSpan[]): TextSpan[][];
export declare function mergedSpanText(spans: TextSpan[]): string;
export declare function mergedSpanBbox(spans: TextSpan[]): [number, number, number, number];
//# sourceMappingURL=merge-text-spans.d.ts.map