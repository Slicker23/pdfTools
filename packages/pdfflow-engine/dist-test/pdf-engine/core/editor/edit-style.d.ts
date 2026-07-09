import type { RGBA, SpanSource, TextSpan } from "../content/types";
export declare function effectiveVisualSize(span: TextSpan): number;
export interface TextBlockContext {
    /** Byte offset of first byte after the BT operator in this block. */
    prefixStart: number;
    /** Byte offset at the show operator (SpanSource.regionStart). */
    showStart: number;
    /** Byte offset at end of show operator (SpanSource.regionEnd). */
    showEnd: number;
    fontRef: string;
    fontSize: number;
    fillRgb: {
        r: number;
        g: number;
        b: number;
    };
    /** Serialized positioning operators between style prefix and show (Td/Tm/...). */
    positionBytes: Uint8Array;
}
/** Discover style context for an isolated BT…ET block. */
export declare function discoverTextBlockContext(decoded: Uint8Array, showStart: number, showEnd: number, options?: {
    fillFallback?: {
        r: number;
        g: number;
        b: number;
    };
}): TextBlockContext | undefined;
export interface TextBlockByteRange {
    blockStart: number;
    blockEnd: number;
    ctx: TextBlockContext;
}
/** Byte range of an isolated BT…ET block wrapping a show operator. */
export declare function discoverTextBlockByteRange(decoded: Uint8Array, showStart: number, showEnd: number): TextBlockByteRange | undefined;
export declare function buildStyleAndShowReplacement(ctx: TextBlockContext, source: SpanSource, span: TextSpan, newBytes: Uint8Array, comp: number, opts: {
    newColor?: string;
    newSize?: number;
    newFontRef?: string;
}): Uint8Array | undefined;
export declare function styleChangeRequested(span: TextSpan, newColor?: string, newSize?: number, fontStyle?: {
    family?: string;
    bold?: boolean;
    italic?: boolean;
}, original?: {
    color?: string;
    size?: number;
}): boolean;
export declare function fillColorToHex(c: RGBA): string;
//# sourceMappingURL=edit-style.d.ts.map