/**
 * SHA-256 / SHA-384 / SHA-512.
 *
 * Needed by the PDF 2.0 (R6 / AESV3) standard security handler, whose hardened
 * hash (Algorithm 2.B) selects between the three based on a running modulus.
 * SHA-256 uses 32-bit words; SHA-384/512 use BigInt for correct 64-bit math.
 */
export declare function sha256(input: Uint8Array): Uint8Array;
export declare function sha512(input: Uint8Array): Uint8Array;
export declare function sha384(input: Uint8Array): Uint8Array;
//# sourceMappingURL=sha2.d.ts.map