/**
 * AES (Rijndael) block cipher with CBC mode.
 *
 * Supports 128- and 256-bit keys, which is all the PDF standard security handler
 * needs:
 *  - AESV2 (R4): AES-128-CBC, PKCS#7 padded, IV = first 16 bytes of the data
 *  - AESV3 (R6): AES-256-CBC, PKCS#7 padded, plus AES-128-CBC no-padding encrypt
 *    inside the Algorithm 2.B key-derivation loop
 *
 * S-boxes and round constants are generated at load time from GF(2^8) math to
 * avoid shipping large literal tables.
 */
/** AES-CBC encryption without padding. `data.length` must be a multiple of 16. */
export declare function aesCbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array;
/**
 * AES-CBC decryption. IV is the first 16 bytes of `data` (PDF convention).
 * Set `removePadding` to strip PKCS#7 padding.
 */
export declare function aesCbcDecryptWithIvPrefix(key: Uint8Array, data: Uint8Array, removePadding?: boolean): Uint8Array;
/** AES-CBC decryption with an explicit IV. */
export declare function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array, removePadding?: boolean): Uint8Array;
//# sourceMappingURL=aes.d.ts.map