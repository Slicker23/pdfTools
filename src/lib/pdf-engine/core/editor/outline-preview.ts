/**
 * Shared span outline path assembly (M6 preview + flatten).
 */
import type { Matrix } from "../content/matrix";
import { multiply } from "../content/matrix";
import type { RGBA, TextSpan } from "../content/types";
import type { EditLocator } from "./edit-text";
import type { CosDocument } from "../document";
import type { OutlineFont } from "../fonts/outline-font";
import { transformOutline } from "../fonts/outlines/transform";
import type { PathSegment } from "../fonts/outlines/types";
import { outlineBBox } from "../fonts/outlines/types";

const GLYPH_SCALE: Matrix = [0.001, 0, 0, 0.001, 0, 0];

function glyphTransform(span: TextSpan, glyphIndex: number): Matrix {
  const glyphs = span.glyphs;
  if (glyphs && glyphs[glyphIndex]) {
    const g = glyphs[glyphIndex]!;
    const origin = span.origin;
    const dx = g.x - origin.x;
    const dy = g.y - origin.y;
    return multiply(span.matrix, [1, 0, 0, 1, dx, dy]);
  }
  return span.matrix;
}

function outlineForGlyph(
  font: OutlineFont,
  g: ReturnType<OutlineFont["decode"]>[number]
): { segments: PathSegment[] } | undefined {
  const outline =
    g.gid != null
      ? font.outlineForGlyph(g.gid)
      : g.cid != null
        ? font.outlineForCid(g.cid)
        : font.outlineForCode(g.code, g.unicode);
  if (!outline || outline.segments.length === 0) return undefined;
  return outline;
}

/** Merge axis-aligned bounds. */
function mergeBboxes(
  boxes: [number, number, number, number][]
): [number, number, number, number] | undefined {
  if (boxes.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [bx0, by0, bx1, by1] of boxes) {
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
  }
  if (!Number.isFinite(x0)) return undefined;
  return [x0, y0, x1, y1];
}

/** Page-space path segments for each glyph in a span. */
export function collectSpanOutlinePaths(
  span: TextSpan,
  font: OutlineFont
): { glyphs: PathSegment[][]; fillColor?: RGBA; bbox?: [number, number, number, number] } | undefined {
  if (!font.hasOutlines) return undefined;

  const decoded = font.decode(span.codes);
  const glyphs: PathSegment[][] = [];
  const glyphBboxes: [number, number, number, number][] = [];

  for (let i = 0; i < decoded.length; i++) {
    const raw = outlineForGlyph(font, decoded[i]!);
    if (!raw) continue;
    const tm = glyphTransform(span, i);
    const combined = multiply(tm, GLYPH_SCALE);
    const segs = transformOutline(raw, combined).segments;
    if (!segs.some((s) => s.op !== "Z")) continue;
    glyphs.push(segs);
    const bb = outlineBBox(segs);
    if (bb) glyphBboxes.push(bb);
  }

  if (glyphs.length === 0) return undefined;

  return {
    glyphs,
    fillColor: span.fillColor,
    bbox: mergeBboxes(glyphBboxes),
  };
}

function locatorKey(streamNum: number, regionStart: number): string {
  return `${streamNum}:${regionStart}`;
}

/** Resolve a block locator to page-space outline paths via the open document. */
export async function getBlockOutlinePaths(
  doc: CosDocument,
  locator: EditLocator
): Promise<{
  glyphs: PathSegment[][];
  fillColor?: RGBA;
  bbox?: [number, number, number, number];
} | undefined> {
  const page = doc.pages()[locator.page - 1];
  if (!page) return undefined;

  const { spans } = await doc.pageSpans(page);
  const span = spans.find(
    (s) =>
      s.source &&
      locatorKey(s.source.streamNum, s.source.regionStart) ===
        locatorKey(locator.streamNum, locator.regionStart)
  );
  if (!span?.fontDict || span.fontDict.type !== "dict") return undefined;

  const outlineFont = await doc.buildOutlineFontForDict(span.fontDict);
  return collectSpanOutlinePaths(span, outlineFont);
}
