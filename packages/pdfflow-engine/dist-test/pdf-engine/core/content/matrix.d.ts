/**
 * 2D affine transforms in PDF form: [a b c d e f] represents
 *
 *   | a b 0 |
 *   | c d 0 |
 *   | e f 1 |
 *
 * mapping (x, y) -> (a*x + c*y + e, b*x + d*y + f).
 */
export type Matrix = [number, number, number, number, number, number];
export declare const IDENTITY: Matrix;
/**
 * Compose `m` then `n` (i.e. apply `m` first, then `n`): returns `m x n` in PDF
 * row-vector convention, so `apply(multiply(m, n), p) === apply(n, apply(m, p))`.
 */
export declare function multiply(m: Matrix, n: Matrix): Matrix;
/** Apply a matrix to a point. */
export declare function apply(m: Matrix, x: number, y: number): {
    x: number;
    y: number;
};
/** Invert a 2D affine PDF matrix. Returns identity when the matrix is singular. */
export declare function invert(m: Matrix): Matrix;
//# sourceMappingURL=matrix.d.ts.map