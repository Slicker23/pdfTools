/**
 * FlateDecode support.
 *
 * M0 only needs Flate (for xref streams and object streams). The full filter
 * pipeline (LZW, ASCII85/Hex, RunLength, DCT passthrough) lands in M1. Inflate
 * itself is provided by a platform adapter to keep the core isomorphic.
 */
import type { InflateFn } from "../platform";
import { type CosObject } from "../cos/types";
/** Extract predictor params from a /DecodeParms dict (or the first of an array). */
export declare function readDecodeParms(parms: CosObject | undefined): import("./predictors").PredictorParams;
/**
 * Inflate raw Flate data and reverse any predictor.
 * `decodeParms` is the stream's /DecodeParms (or /DP) value.
 */
export declare function flateDecode(raw: Uint8Array, decodeParms: CosObject | undefined, inflate: InflateFn): Promise<Uint8Array>;
/** Apply the predictor (if any) to already-inflated data. */
export declare function applyFlatePredictor(inflated: Uint8Array, decodeParms: CosObject | undefined): Uint8Array;
//# sourceMappingURL=flate.d.ts.map