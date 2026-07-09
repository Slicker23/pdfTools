/**
 * FlateDecode support.
 *
 * M0 only needs Flate (for xref streams and object streams). The full filter
 * pipeline (LZW, ASCII85/Hex, RunLength, DCT passthrough) lands in M1. Inflate
 * itself is provided by a platform adapter to keep the core isomorphic.
 */
import type { InflateFn } from "../platform";
import {
  asNumber,
  dictGet,
  isArray,
  isDict,
  type CosObject,
} from "../cos/types";
import { applyPredictor, normalizePredictorParams } from "./predictors";

/** Extract predictor params from a /DecodeParms dict (or the first of an array). */
export function readDecodeParms(parms: CosObject | undefined) {
  let d = parms;
  if (isArray(parms) && parms.items.length > 0) d = parms.items[0];
  if (!isDict(d)) return normalizePredictorParams(undefined, undefined, undefined, undefined);
  return normalizePredictorParams(
    asNumber(dictGet(d, "Predictor")),
    asNumber(dictGet(d, "Colors")),
    asNumber(dictGet(d, "BitsPerComponent")),
    asNumber(dictGet(d, "Columns"))
  );
}

/**
 * Inflate raw Flate data and reverse any predictor.
 * `decodeParms` is the stream's /DecodeParms (or /DP) value.
 */
export async function flateDecode(
  raw: Uint8Array,
  decodeParms: CosObject | undefined,
  inflate: InflateFn
): Promise<Uint8Array> {
  const inflated = await inflate(raw);
  return applyFlatePredictor(inflated, decodeParms);
}

/** Apply the predictor (if any) to already-inflated data. */
export function applyFlatePredictor(
  inflated: Uint8Array,
  decodeParms: CosObject | undefined
): Uint8Array {
  const params = readDecodeParms(decodeParms);
  if (params.predictor > 1) return applyPredictor(inflated, params);
  return inflated;
}
