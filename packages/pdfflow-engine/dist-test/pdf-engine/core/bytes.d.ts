/**
 * Byte-level primitives shared by the COS layer.
 *
 * PDF is a byte format: strings are byte sequences, not text. Everything here
 * operates on `Uint8Array` so the engine stays isomorphic (no Node Buffer) and
 * byte-exact (no lossy string conversions).
 */
export declare const NUL = 0;
export declare const TAB = 9;
export declare const LF = 10;
export declare const FF = 12;
export declare const CR = 13;
export declare const SP = 32;
export declare function isWhitespace(b: number): boolean;
export declare function isEol(b: number): boolean;
export declare function isDelimiter(b: number): boolean;
/** A "regular" character is anything that is neither whitespace nor a delimiter. */
export declare function isRegular(b: number): boolean;
export declare function isDigit(b: number): boolean;
export declare function isHexDigit(b: number): boolean;
export declare function hexVal(b: number): number;
/** Encode a JS string as Latin-1/ASCII bytes (each char -> low byte). */
export declare function asciiBytes(s: string): Uint8Array;
/** Decode bytes as Latin-1 so every byte maps 1:1 to a char (round-trippable). */
export declare function bytesToLatin1(b: Uint8Array): string;
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
/** Does `buf` contain `needle` (ascii) starting exactly at `pos`? */
export declare function matchAscii(buf: Uint8Array, pos: number, needle: string): boolean;
/** Find the first index of `needle` (ascii) at or after `from`, or -1. */
export declare function indexOfAscii(buf: Uint8Array, needle: string, from?: number): number;
/** Find the last index of `needle` (ascii) at or before `from` (default end). */
export declare function lastIndexOfAscii(buf: Uint8Array, needle: string, from?: number): number;
/**
 * Growable byte buffer for serialization. Avoids repeated array copies by
 * collecting chunks and concatenating once.
 */
export declare class ByteWriter {
    private chunks;
    private len;
    get length(): number;
    bytes(data: Uint8Array): this;
    byte(b: number): this;
    ascii(s: string): this;
    toUint8Array(): Uint8Array;
}
export declare function concatBytes(parts: Uint8Array[]): Uint8Array;
//# sourceMappingURL=bytes.d.ts.map