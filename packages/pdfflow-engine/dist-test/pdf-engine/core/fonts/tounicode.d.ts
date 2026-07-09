/**
 * /ToUnicode CMap parsing (ISO 32000-1, 9.10.3).
 *
 * Parses the `beginbfchar`/`beginbfrange` sections of a ToUnicode CMap into a
 * map from character code (the integer value of the shown bytes) to a Unicode
 * string. Destination values are hex UTF-16BE, per the spec.
 *
 * This is intentionally a focused parser: ToUnicode CMaps are a small, regular
 * subset of the PostScript CMap language, so we scan for the bf* blocks rather
 * than running a full interpreter.
 */
export interface ToUnicodeMap {
    /** code (integer value of the byte sequence) -> Unicode string. */
    map: Map<number, string>;
    lookup(code: number): string | undefined;
}
export declare function parseToUnicode(bytes: Uint8Array): ToUnicodeMap;
//# sourceMappingURL=tounicode.d.ts.map