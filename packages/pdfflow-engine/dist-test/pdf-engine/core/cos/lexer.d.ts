export type TokenKind = "int" | "real" | "string" | "name" | "arrayOpen" | "arrayClose" | "dictOpen" | "dictClose" | "keyword" | "eof";
export interface Token {
    kind: TokenKind;
    start: number;
    end: number;
    /** int/real value */
    num?: number;
    /** original numeric text (for real round-tripping) */
    raw?: string;
    /** string bytes (decoded from literal/hex syntax) */
    bytes?: Uint8Array;
    /** true if a <hex> string */
    hex?: boolean;
    /** decoded name (without leading /) */
    name?: string;
    /** keyword text (obj, endobj, stream, R, true, false, null, ...) */
    keyword?: string;
}
export declare class Lexer {
    readonly buf: Uint8Array;
    pos: number;
    constructor(buf: Uint8Array, pos?: number);
    /** Skip whitespace and `%`-comments (comments run to end of line). */
    skipWhitespaceAndComments(): void;
    nextToken(): Token;
    private readNumber;
    private readName;
    private readKeyword;
    private readHexString;
    private readLiteralString;
}
//# sourceMappingURL=lexer.d.ts.map