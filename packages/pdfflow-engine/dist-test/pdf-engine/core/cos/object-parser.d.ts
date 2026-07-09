import { type CosObject } from "./types";
/** Resolves an indirect reference (used for indirect /Length on streams). */
export type RefResolver = (num: number, gen: number) => CosObject | undefined;
export interface IndirectObject {
    num: number;
    gen: number;
    obj: CosObject;
    /** byte offset of the start of "<num> <gen> obj" */
    start: number;
    /** byte offset just past "endobj" (or best effort) */
    end: number;
}
export declare class ObjectParser {
    private lexer;
    private lookahead;
    private resolver?;
    private depth;
    constructor(buf: Uint8Array, pos?: number, resolver?: RefResolver);
    get position(): number;
    private peek;
    private take;
    /**
     * Parse "<num> <gen> obj <value> endobj" at the current position.
     * Throws if the header is malformed.
     */
    parseIndirectObject(): IndirectObject;
    /** Parse a single COS value at the current position. */
    parseObject(): CosObject;
    private parseKeyword;
    private parseNumberOrRef;
    private parseArray;
    private parseArrayInner;
    private parseDict;
    private parseDictInner;
    private parseDictOrStream;
    private readStreamBody;
    private resolveLength;
    private endstreamFollows;
    private skipToAfterEndstream;
    private findEndstream;
}
/** Convenience: parse a single value from a byte buffer. */
export declare function parseCosObject(buf: Uint8Array, pos?: number): CosObject;
//# sourceMappingURL=object-parser.d.ts.map