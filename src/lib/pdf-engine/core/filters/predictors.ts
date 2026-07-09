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

export function normalizePredictorParams(
  predictor: number | undefined,
  colors: number | undefined,
  bitsPerComponent: number | undefined,
  columns: number | undefined
): PredictorParams {
  return {
    predictor: predictor ?? 1,
    colors: colors ?? 1,
    bitsPerComponent: bitsPerComponent ?? 8,
    columns: columns ?? 1,
  };
}

export function applyPredictor(data: Uint8Array, params: PredictorParams): Uint8Array {
  if (params.predictor <= 1) return data;
  const { colors, bitsPerComponent, columns } = params;
  const bpp = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  if (rowLength <= 0) return data;

  if (params.predictor === 2) {
    return tiffPredictor(data, colors, bitsPerComponent, columns, rowLength);
  }
  return pngPredictor(data, bpp, rowLength);
}

function pngPredictor(data: Uint8Array, bpp: number, rowLength: number): Uint8Array {
  // Each PNG row is: [filterType][rowLength bytes].
  const rowCount = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rowCount * rowLength);
  let prev = new Uint8Array(rowLength); // previous decoded row (starts as zeros)
  let src = 0;
  let dst = 0;

  for (let r = 0; r < rowCount; r++) {
    const filter = data[src++]!;
    const cur = out.subarray(dst, dst + rowLength);
    cur.set(data.subarray(src, src + rowLength));
    src += rowLength;

    switch (filter) {
      case 0: // None
        break;
      case 1: // Sub
        for (let i = bpp; i < rowLength; i++) {
          cur[i] = (cur[i]! + cur[i - bpp]!) & 0xff;
        }
        break;
      case 2: // Up
        for (let i = 0; i < rowLength; i++) {
          cur[i] = (cur[i]! + prev[i]!) & 0xff;
        }
        break;
      case 3: // Average
        for (let i = 0; i < rowLength; i++) {
          const left = i >= bpp ? cur[i - bpp]! : 0;
          cur[i] = (cur[i]! + ((left + prev[i]!) >> 1)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let i = 0; i < rowLength; i++) {
          const left = i >= bpp ? cur[i - bpp]! : 0;
          const up = prev[i]!;
          const upLeft = i >= bpp ? prev[i - bpp]! : 0;
          cur[i] = (cur[i]! + paeth(left, up, upLeft)) & 0xff;
        }
        break;
      default:
        // Unknown filter - leave row as-is.
        break;
    }
    prev = cur.slice();
    dst += rowLength;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function tiffPredictor(
  data: Uint8Array,
  colors: number,
  bitsPerComponent: number,
  columns: number,
  rowLength: number
): Uint8Array {
  // Only the common 8-bit case is exercised by xref/object streams. For other
  // bit depths we return the data unchanged (rare in practice).
  if (bitsPerComponent !== 8) return data;
  const out = data.slice();
  const rowCount = Math.floor(out.length / rowLength);
  for (let r = 0; r < rowCount; r++) {
    const base = r * rowLength;
    for (let col = 1; col < columns; col++) {
      for (let c = 0; c < colors; c++) {
        const i = base + col * colors + c;
        const left = base + (col - 1) * colors + c;
        out[i] = (out[i]! + out[left]!) & 0xff;
      }
    }
  }
  return out;
}
