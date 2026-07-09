/**
 * PNG and TIFF predictor reversal for FlateDecode / LZWDecode streams.
 *
 * Predictor values (per PDF spec, /DecodeParms):
 *   1        no prediction
 *   2        TIFF predictor 2 (horizontal differencing)
 *   10-15    PNG predictors (each row prefixed with a filter-type byte)
 */
export interface PredictorParams {
    predictor: number;
    colors: number;
    bitsPerComponent: number;
    columns: number;
}
export declare function normalizePredictorParams(predictor: number | undefined, colors: number | undefined, bitsPerComponent: number | undefined, columns: number | undefined): PredictorParams;
export declare function applyPredictor(data: Uint8Array, params: PredictorParams): Uint8Array;
//# sourceMappingURL=predictors.d.ts.map