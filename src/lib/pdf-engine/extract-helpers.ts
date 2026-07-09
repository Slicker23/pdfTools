import type { PdfEditBBox, PdfEditFont } from "../pdf/edit-model";
import { looksGarbled } from "../pdf/text-quality";

export { looksGarbled };

export interface CharSpan {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  fontSize: number;
  fontKey: string;
  fontName: string;
  bold: boolean;
  italic: boolean;
  color: string;
}

export function parseFontName(raw: string): { name: string; bold: boolean; italic: boolean } {
  const lower = raw.toLowerCase();
  let bold = /bold|black|heavy|semibold|demi/.test(lower) || lower.includes("bold");
  const italic = /italic|oblique|ita/.test(lower);
  let name = raw;
  if (name.includes("+")) name = name.split("+")[1] ?? name;
  name = name.replace(/,?(Bold|Italic|Regular|MT)$/i, "").trim();
  if (!name) name = "Helvetica";
  return { name, bold, italic };
}

export function rgbaToHex(r: number, g: number, b: number): string {
  const norm = (n: number) => {
    const v = n >= 0 && n <= 1 ? n * 255 : n;
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  };
  return `#${norm(r)}${norm(g)}${norm(b)}`;
}

export function groupByBaseline(spans: CharSpan[]): CharSpan[][] {
  const sorted = [...spans].sort((a, b) => b.baseline - a.baseline || a.x - b.x);
  const lines: CharSpan[][] = [];
  for (const span of sorted) {
    let placed = false;
    for (const line of lines) {
      const ref = line[0]!;
      const tol = Math.max(span.fontSize, ref.fontSize) * 0.35;
      if (Math.abs(span.baseline - ref.baseline) <= tol) {
        line.push(span);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([span]);
  }
  return lines;
}

export function stylesMatch(a: CharSpan, b: CharSpan): boolean {
  return (
    a.fontKey === b.fontKey &&
    Math.abs(a.fontSize - b.fontSize) < 0.25 &&
    a.italic === b.italic &&
    a.bold === b.bold
  );
}

export function mergeSpans(
  spans: CharSpan[],
  options?: { aggressiveWordSpaces?: boolean }
): { text: string; bbox: PdfEditBBox; font: PdfEditFont; baseline: number } {
  const ordered = [...spans].sort((a, b) => a.x - b.x);
  const parts: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]!;
    if (i > 0) {
      const prev = ordered[i - 1]!;
      const gap = s.x - (prev.x + prev.w);
      if (gap > 1 && !parts[parts.length - 1]!.endsWith(" ") && !s.text.startsWith(" ")) {
        const letterGap =
          !options?.aggressiveWordSpaces &&
          prev.text.trim().length === 1 &&
          s.text.trim().length === 1 &&
          gap <= Math.max(prev.fontSize, s.fontSize) * 0.45;
        const wordGap = gap > Math.max(prev.fontSize, s.fontSize) * 0.35;
        if (wordGap && !letterGap) parts.push(" ");
      }
    }
    parts.push(s.text);
  }
  const text = parts.join("").trim();
  const x0 = Math.min(...ordered.map((s) => s.x));
  const y0 = Math.min(...ordered.map((s) => s.y));
  const x1 = Math.max(...ordered.map((s) => s.x + s.w));
  const y1 = Math.max(...ordered.map((s) => s.y + s.h));
  const first = ordered[0]!;
  return {
    text,
    bbox: { px: x0, py: y0, pw: Math.max(x1 - x0, 1), ph: Math.max(y1 - y0, 1) },
    font: {
      name: first.fontName,
      size: first.fontSize,
      bold: first.bold,
      italic: first.italic,
      color: first.color,
      embeddedFontRef: first.fontKey,
    },
    baseline: first.baseline,
  };
}

export function splitLineAtColumnGaps(spans: CharSpan[]): CharSpan[][] {
  const ordered = [...spans].sort((a, b) => a.x - b.x);
  if (ordered.length <= 1) return [ordered];

  const runs: CharSpan[][] = [[ordered[0]!]];
  for (let i = 1; i < ordered.length; i++) {
    const s = ordered[i]!;
    const prev = runs[runs.length - 1]![runs[runs.length - 1]!.length - 1]!;
    const gap = s.x - (prev.x + prev.w);
    const height = Math.max(prev.h, s.h);
    const gapMax = Math.max(height * 1.5, 24);
    if (gap <= gapMax && stylesMatch(prev, s)) {
      runs[runs.length - 1]!.push(s);
    } else {
      runs.push([s]);
    }
  }
  return runs;
}

export function shouldUseBounded(spans: CharSpan[], mergedText: string): boolean {
  if (spans.length < 4 || mergedText.length <= 20) return false;
  const single = spans.filter((s) => s.text.trim().length === 1).length;
  return single / spans.length > 0.6;
}
