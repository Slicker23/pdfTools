/**
 * Emit PDF path operators from glyph outlines (M6).
 */
import { asciiBytes, concatBytes } from "../bytes";
import type { TextSpan } from "../content/types";
import type { OutlineFont } from "../fonts/outline-font";
import { collectSpanOutlinePaths } from "./outline-preview";
import { quadToCubic } from "../fonts/outlines/transform";
import type { PathSegment } from "../fonts/outlines/types";

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3);
}

export function segmentsToPdfPath(segments: PathSegment[]): Uint8Array {
  const parts: string[] = [];
  let cx = 0;
  let cy = 0;
  for (const s of segments) {
    switch (s.op) {
      case "M":
        parts.push(`${fmt(s.x)} ${fmt(s.y)} m`);
        cx = s.x;
        cy = s.y;
        break;
      case "L":
        parts.push(`${fmt(s.x)} ${fmt(s.y)} l`);
        cx = s.x;
        cy = s.y;
        break;
      case "Q": {
        const c = quadToCubic(cx, cy, s.x1, s.y1, s.x, s.y);
        parts.push(
          `${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)} c`
        );
        cx = s.x;
        cy = s.y;
        break;
      }
      case "C":
        parts.push(
          `${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)} ${fmt(s.x)} ${fmt(s.y)} c`
        );
        cx = s.x;
        cy = s.y;
        break;
      case "Z":
        parts.push("h");
        break;
    }
  }
  return asciiBytes(parts.join("\n") + (parts.length ? "\n" : ""));
}

function colorOps(color: { r: number; g: number; b: number } | undefined): Uint8Array {
  if (!color) return asciiBytes("0 g\n");
  return asciiBytes(`${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} rg\n`);
}

/** Build PDF content-stream bytes that paint a span's glyphs as filled paths. */
export function spanToPathContent(span: TextSpan, font: OutlineFont): Uint8Array | undefined {
  const collected = collectSpanOutlinePaths(span, font);
  if (!collected) return undefined;

  const parts: Uint8Array[] = [asciiBytes("q\n"), colorOps(collected.fillColor)];
  for (const segs of collected.glyphs) {
    parts.push(segmentsToPdfPath(segs));
  }
  parts.push(asciiBytes("f\nQ\n"));
  const body = concatBytes(parts);
  return body.length > 4 ? body : undefined;
}

/** Page-space bbox of span outlines (for tests). */
export function spanOutlineBBox(
  span: TextSpan,
  font: OutlineFont
): [number, number, number, number] | undefined {
  return collectSpanOutlinePaths(span, font)?.bbox;
}

/** SVG path `d` for page-space segments (PDF y-up; flip in the view layer). */
export function segmentsToSvgD(segments: PathSegment[]): string {
  const parts: string[] = [];
  let cx = 0;
  let cy = 0;
  for (const s of segments) {
    switch (s.op) {
      case "M":
        parts.push(`M ${s.x} ${s.y}`);
        cx = s.x;
        cy = s.y;
        break;
      case "L":
        parts.push(`L ${s.x} ${s.y}`);
        cx = s.x;
        cy = s.y;
        break;
      case "Q": {
        const c = quadToCubic(cx, cy, s.x1, s.y1, s.x, s.y);
        parts.push(`C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`);
        cx = s.x;
        cy = s.y;
        break;
      }
      case "C":
        parts.push(`C ${s.x1} ${s.y1} ${s.x2} ${s.y2} ${s.x} ${s.y}`);
        cx = s.x;
        cy = s.y;
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join(" ");
}
