/** Column detection shared by browser layout extract and server worker. */

export interface TextSpanBounds {
  x: number;
  width: number;
  y?: number;
  height?: number;
}

export interface ColumnAnalysis {
  splitX: number;
  leftWidthPct: number;
  leftCount: number;
  rightCount: number;
}

/** Find the gutter between two text columns from span positions. */
export function findColumnSplitX(spans: TextSpanBounds[], pageWidth: number): number | null {
  if (spans.length < 8) return null;

  const centers = spans
    .map((s) => s.x + s.width / 2)
    .filter((c) => c > pageWidth * 0.08 && c < pageWidth * 0.92)
    .sort((a, b) => a - b);

  if (centers.length < 8) return null;

  let bestGap = 0;
  let bestSplit = pageWidth * 0.38;

  for (let i = 0; i < centers.length - 1; i++) {
    const gap = centers[i + 1] - centers[i];
    const mid = (centers[i] + centers[i + 1]) / 2;
    if (mid < pageWidth * 0.2 || mid > pageWidth * 0.58) continue;
    if (gap > bestGap) {
      bestGap = gap;
      bestSplit = mid;
    }
  }

  if (bestGap < pageWidth * 0.025) {
    bestSplit = pageWidth * 0.38;
  }

  const left = spans.filter((s) => s.x + s.width / 2 < bestSplit);
  const right = spans.filter((s) => s.x + s.width / 2 >= bestSplit);

  if (left.length < 4 || right.length < 4) return null;

  const gutter = spans.filter((s) => {
    const cx = s.x + s.width / 2;
    return cx > bestSplit - pageWidth * 0.04 && cx < bestSplit + pageWidth * 0.06;
  });
  if (gutter.length > spans.length * 0.14) return null;

  return bestSplit;
}

export function analyzeColumns(
  spans: TextSpanBounds[],
  pageWidth: number
): ColumnAnalysis | null {
  const splitX = findColumnSplitX(spans, pageWidth);
  if (splitX === null) return null;

  const left = spans.filter((s) => s.x + s.width / 2 < splitX);
  const right = spans.filter((s) => s.x + s.width / 2 >= splitX);

  return {
    splitX,
    leftWidthPct: Math.round(Math.max(26, Math.min(42, (splitX / pageWidth) * 100))),
    leftCount: left.length,
    rightCount: right.length,
  };
}
