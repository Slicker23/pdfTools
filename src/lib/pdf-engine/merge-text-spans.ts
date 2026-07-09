/**
 * Post-extract merge: combine adjacent same-line text runs into one logical block.
 *
 * PDF authors often emit one show operator per glyph cluster (e.g. "T" + "ransport").
 * We merge runs that share baseline/style and are close horizontally so the editor
 * shows one selection box per word/phrase while preserving per-run locators.
 */
import type { TextSpan } from "./core";
import { asName, dictGet, isDict } from "./core/cos/types";
import { effectiveVisualSize } from "./core/editor/edit-style";

function spanBaseFont(span: TextSpan): string {
  if (!span.fontDict || !isDict(span.fontDict)) return span.fontRef;
  return asName(dictGet(span.fontDict, "BaseFont")) ?? span.fontRef;
}

export function spanRightEdge(span: TextSpan): number {
  if (span.rightEdge != null) return span.rightEdge;
  if (span.bbox) return span.bbox[2];
  return span.origin.x;
}

export function spanLeftEdge(span: TextSpan): number {
  if (span.bbox) return span.bbox[0];
  return span.origin.x;
}

function spanBaseline(span: TextSpan): number {
  return span.origin.y;
}

function spanVisualSize(span: TextSpan): number {
  return effectiveVisualSize(span);
}

function colorsMatch(a: TextSpan, b: TextSpan): boolean {
  const fa = a.fillColor;
  const fb = b.fillColor;
  if (!fa && !fb) return true;
  if (!fa || !fb) return false;
  const eps = 0.004;
  return (
    Math.abs(fa.r - fb.r) <= eps &&
    Math.abs(fa.g - fb.g) <= eps &&
    Math.abs(fa.b - fb.b) <= eps
  );
}

/** True when two spans can be treated as one visual word/phrase fragment. */
export function spansMergeable(a: TextSpan, b: TextSpan): boolean {
  if (!a.source || !b.source) return false;
  if (a.renderMode !== 0 || b.renderMode !== 0) return false;
  if (!(a.text ?? "").length || !(b.text ?? "").length) return false;

  if (spanBaseFont(a) !== spanBaseFont(b)) return false;
  if (!colorsMatch(a, b)) return false;

  const sizeA = spanVisualSize(a);
  const sizeB = spanVisualSize(b);
  if (Math.abs(sizeA - sizeB) > 0.35) return false;

  const baselineTol = Math.max(sizeA, sizeB) * 0.35;
  if (Math.abs(spanBaseline(a) - spanBaseline(b)) > baselineTol) return false;

  const gap = spanLeftEdge(b) - spanRightEdge(a);
  const size = Math.max(sizeA, sizeB);
  const aLen = (a.text ?? "").trim().length;
  const bLen = (b.text ?? "").trim().length;
  let maxGap = size * 0.75;
  if (aLen <= 1 && bLen <= 1) {
    // Per-glyph PDFs (Canva/Word): keep letter clusters, break at word spaces.
    maxGap = size * 0.32;
  } else if (aLen <= 2 || bLen <= 2) {
    // Split first glyph ("T" + "ransport").
    maxGap = size * 0.55;
  }
  const minGap = -size * 0.2;
  return gap >= minGap && gap <= maxGap;
}

function joinSpanText(prev: TextSpan, next: TextSpan): string {
  const a = prev.text ?? "";
  const b = next.text ?? "";
  if (!a.length) return b;
  if (!b.length) return a;

  const gap = spanLeftEdge(next) - spanRightEdge(prev);
  const size = Math.max(spanVisualSize(prev), spanVisualSize(next));
  const last = a[a.length - 1]!;
  const first = b[0]!;

  const isWordGap = gap > size * 0.5;
  const camelWordBreak =
    /[a-zà-öø-ÿ]/.test(last) && /[A-ZÀ-Ö]/.test(first);
  const digitWordBreak =
    (/[a-zà-öø-ÿ]/.test(last) && /\d/.test(first)) ||
    (/\d/.test(last) && /[A-Za-zÀ-Öà-öø-ÿ]/.test(first));

  if (
    (isWordGap || camelWordBreak || digitWordBreak) &&
    !/\s$/.test(a) &&
    !/^\s/.test(b) &&
    !/^[,;:.!?|)]/.test(b)
  ) {
    return a + " " + b;
  }
  return a + b;
}

function unionBbox(spans: TextSpan[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of spans) {
    if (!s.bbox) continue;
    x0 = Math.min(x0, s.bbox[0]);
    y0 = Math.min(y0, s.bbox[1]);
    x1 = Math.max(x1, s.bbox[2]);
    y1 = Math.max(y1, s.bbox[3]);
  }
  if (!Number.isFinite(x0)) return [0, 0, 1, 1];
  return [x0, y0, x1, y1];
}

/** Group editable spans on one page into merge candidates (each group → one block). */
export function groupMergeableSpans(spans: TextSpan[]): TextSpan[][] {
  const editable = spans.filter((s) => s.source && (s.text ?? "").trim());
  if (!editable.length) return [];

  const sorted = [...editable].sort(
    (a, b) => spanBaseline(b) - spanBaseline(a) || spanLeftEdge(a) - spanLeftEdge(b)
  );

  const lines: TextSpan[][] = [];
  for (const span of sorted) {
    let placed = false;
    for (const line of lines) {
      const ref = line[0]!;
      const tol = Math.max(spanVisualSize(span), spanVisualSize(ref)) * 0.35;
      if (Math.abs(spanBaseline(span) - spanBaseline(ref)) <= tol) {
        line.push(span);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([span]);
  }

  const groups: TextSpan[][] = [];
  for (const line of lines) {
    const ordered = [...line].sort((a, b) => spanLeftEdge(a) - spanLeftEdge(b));
    let cur: TextSpan[] = [ordered[0]!];
    for (let i = 1; i < ordered.length; i++) {
      const prev = cur[cur.length - 1]!;
      const next = ordered[i]!;
      if (spansMergeable(prev, next)) {
        cur.push(next);
      } else {
        groups.push(cur);
        cur = [next];
      }
    }
    groups.push(cur);
  }

  return groups;
}

export function mergedSpanText(spans: TextSpan[]): string {
  if (!spans.length) return "";
  let text = spans[0]!.text ?? "";
  for (let i = 1; i < spans.length; i++) {
    const syntheticPrev = { ...spans[i - 1]!, text };
    text = joinSpanText(syntheticPrev, spans[i]!);
  }
  return text;
}

export function mergedSpanBbox(spans: TextSpan[]): [number, number, number, number] {
  return unionBbox(spans);
}
