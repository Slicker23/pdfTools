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

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * Compose `m` then `n` (i.e. apply `m` first, then `n`): returns `m x n` in PDF
 * row-vector convention, so `apply(multiply(m, n), p) === apply(n, apply(m, p))`.
 */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

/** Apply a matrix to a point. */
export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Invert a 2D affine PDF matrix. Returns identity when the matrix is singular. */
export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return IDENTITY;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const ie = -(ia * e + ic * f);
  const if_ = -(ib * e + id * f);
  return [ia, ib, ic, id, ie, if_];
}
