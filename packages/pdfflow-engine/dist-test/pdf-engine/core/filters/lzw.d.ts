/**
 * LZWDecode (PDF variant): variable-width codes 9-12 bits, clear code 256,
 * EOD code 257, table entries start at 258. `earlyChange` (default 1) matches
 * the PDF/TIFF convention of increasing code width one code early.
 */
export declare function lzwDecode(data: Uint8Array, earlyChange?: number): Uint8Array;
//# sourceMappingURL=lzw.d.ts.map