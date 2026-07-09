/**
 * CMap parsing for Type0 fonts (ISO 32000-1, 9.7.5).
 *
 * A CMap maps a sequence of character-code bytes to CIDs. We support:
 *   - the predefined `Identity-H` / `Identity-V` CMaps (2-byte, CID = code), and
 *   - embedded CMap streams (`codespacerange`, `cidrange`, `cidchar`).
 *
 * Other predefined CMaps (Adobe-Japan1 etc.) are deferred; they fall back to a
 * 2-byte Identity decode so advances/positioning still work, only Unicode via a
 * predefined CID->Unicode table is unavailable (that needs /ToUnicode instead).
 */
export interface DecodedCode {
    /** Integer value of the consumed byte sequence. */
    code: number;
    /** Mapped CID. */
    cid: number;
    /** Number of bytes consumed. */
    byteLen: number;
}
export interface CMap {
    isIdentity: boolean;
    /** Writing mode: 0 = horizontal, 1 = vertical. */
    wmode: number;
    next(bytes: Uint8Array, pos: number): DecodedCode;
}
/** Predefined Identity-H / Identity-V: 2-byte codes, CID = code. */
export declare function identityCMap(wmode?: number): CMap;
/** Resolve a predefined CMap by name; unknown non-Identity names -> undefined. */
export declare function predefinedCMap(name: string): CMap | undefined;
/** Parse an embedded CMap stream body into a decoder. */
export declare function parseCMapStream(bytes: Uint8Array): CMap;
//# sourceMappingURL=cmap.d.ts.map