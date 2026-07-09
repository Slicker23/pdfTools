/**
 * RunLengthDecode.
 *   length 0..127   -> copy the next (length + 1) bytes literally
 *   length 129..255 -> repeat the next byte (257 - length) times
 *   length 128      -> EOD
 */
export declare function runLengthDecode(data: Uint8Array): Uint8Array;
//# sourceMappingURL=runlength.d.ts.map