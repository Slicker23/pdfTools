/**
 * Native style editing within isolated BT…ET text blocks (M8).
 *
 * Targets PDFs where each text run lives in its own BT block (e.g. cv-like.pdf):
 * `BT /F1 12 Tf 0.1 0.2 0.3 rg 10 20 Td (Hello) Tj ET`
 */
import { asciiBytes, concatBytes } from "../bytes";
import { asName, asNumber, dictGet } from "../cos/types";
import { tokenizeContent, type ContentOp } from "../content/tokenizer";
import type { RGBA, SpanSource, TextSpan } from "../content/types";
import { buildShowReplacement } from "./edit-run";
import { parseFontVariant } from "./font-embed";

const SHOW_OPS = new Set(["Tj", "TJ", "'", '"']);

export function effectiveVisualSize(span: TextSpan): number {
  const size = Math.hypot(span.matrix[2], span.matrix[3]);
  return size > 0 ? size : span.fontSize || 12;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | undefined {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (full.length !== 6) return undefined;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return undefined;
  return { r, g, b };
}

function rgbaFromSpan(span: TextSpan): { r: number; g: number; b: number } {
  const c = span.fillColor;
  if (c) return { r: c.r, g: c.g, b: c.b };
  return { r: 0, g: 0, b: 0 };
}

function colorsDiffer(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  eps = 0.004
): boolean {
  return Math.abs(a.r - b.r) > eps || Math.abs(a.g - b.g) > eps || Math.abs(a.b - b.b) > eps;
}

export interface TextBlockContext {
  /** Byte offset of first byte after the BT operator in this block. */
  prefixStart: number;
  /** Byte offset at the show operator (SpanSource.regionStart). */
  showStart: number;
  /** Byte offset at end of show operator (SpanSource.regionEnd). */
  showEnd: number;
  fontRef: string;
  fontSize: number;
  fillRgb: { r: number; g: number; b: number };
  /** Serialized positioning operators between style prefix and show (Td/Tm/...). */
  positionBytes: Uint8Array;
}

/** Discover style context for an isolated BT…ET block. */
export function discoverTextBlockContext(
  decoded: Uint8Array,
  showStart: number,
  showEnd: number,
  options?: { fillFallback?: { r: number; g: number; b: number } }
): TextBlockContext | undefined {
  const ops: ContentOp[] = [...tokenizeContent(decoded)];
  const showIdx = ops.findIndex(
    (o) =>
      SHOW_OPS.has(o.op) &&
      o.opEnd === showEnd &&
      showStart >= (o.operandsStart >= 0 ? o.operandsStart : o.opStart) &&
      showStart < o.opEnd
  );
  if (showIdx < 0) return undefined;

  let btIdx = -1;
  let etIdx = -1;
  let showCount = 0;
  for (let i = showIdx; i >= 0; i--) {
    if (ops[i]!.op === "BT") {
      btIdx = i;
      break;
    }
  }
  if (btIdx < 0) return undefined;

  for (let i = btIdx; i < ops.length; i++) {
    const op = ops[i]!;
    if (SHOW_OPS.has(op.op)) showCount++;
    if (op.op === "ET") {
      etIdx = i;
      break;
    }
  }
  if (etIdx < 0 || showCount !== 1) return undefined;

  let fontRef = "";
  let fontSize = 12;
  let fillRgb = { r: 0, g: 0, b: 0 };
  let hasFill = false;

  for (let i = btIdx + 1; i < showIdx; i++) {
    const op = ops[i]!;
    switch (op.op) {
      case "Tf": {
        fontRef = asName(op.operands[0]) ?? "";
        fontSize = asNumber(op.operands[1]) ?? fontSize;
        break;
      }
      case "rg":
        fillRgb = {
          r: asNumber(op.operands[0]) ?? 0,
          g: asNumber(op.operands[1]) ?? 0,
          b: asNumber(op.operands[2]) ?? 0,
        };
        hasFill = true;
        break;
      case "g": {
        const g = asNumber(op.operands[0]) ?? 0;
        fillRgb = { r: g, g, b: g };
        hasFill = true;
        break;
      }
      case "k": {
        const c = asNumber(op.operands[0]) ?? 0;
        const m = asNumber(op.operands[1]) ?? 0;
        const y = asNumber(op.operands[2]) ?? 0;
        const kVal = asNumber(op.operands[3]) ?? 0;
        fillRgb = {
          r: (1 - c) * (1 - kVal),
          g: (1 - m) * (1 - kVal),
          b: (1 - y) * (1 - kVal),
        };
        hasFill = true;
        break;
      }
      default:
        break;
    }
  }

  if (!fontRef) return undefined;
  if (!hasFill) {
    if (options?.fillFallback) fillRgb = options.fillFallback;
    else fillRgb = { r: 0, g: 0, b: 0 };
  }

  const btOp = ops[btIdx]!;
  let p = btOp.opEnd;
  while (p < decoded.length && decoded[p]! <= 0x20) p++;

  // Position bytes: from end of style ops through start of show operands
  let styleEnd = p;
  for (let i = btIdx + 1; i < showIdx; i++) {
    const op = ops[i]!;
    if (op.op === "Tf" || op.op === "rg" || op.op === "g" || op.op === "k") {
      styleEnd = op.opEnd;
      while (styleEnd < decoded.length && decoded[styleEnd]! <= 0x20) styleEnd++;
    }
  }

  const positionBytes = decoded.subarray(styleEnd, ops[showIdx]!.operandsStart >= 0 ? ops[showIdx]!.operandsStart : ops[showIdx]!.opStart);

  return {
    prefixStart: p,
    showStart,
    showEnd,
    fontRef,
    fontSize,
    fillRgb,
    positionBytes: positionBytes.slice(),
  };
}

export interface TextBlockByteRange {
  blockStart: number;
  blockEnd: number;
  ctx: TextBlockContext;
}

/** Byte range of an isolated BT…ET block wrapping a show operator. */
export function discoverTextBlockByteRange(
  decoded: Uint8Array,
  showStart: number,
  showEnd: number
): TextBlockByteRange | undefined {
  const ctx = discoverTextBlockContext(decoded, showStart, showEnd);
  if (!ctx) return undefined;
  const ops: ContentOp[] = [...tokenizeContent(decoded)];
  const showIdx = ops.findIndex(
    (o) =>
      SHOW_OPS.has(o.op) &&
      o.opEnd === showEnd &&
      showStart >= (o.operandsStart >= 0 ? o.operandsStart : o.opStart) &&
      showStart < o.opEnd
  );
  if (showIdx < 0) return undefined;
  let btIdx = -1;
  let etIdx = -1;
  for (let i = showIdx; i >= 0; i--) {
    if (ops[i]!.op === "BT") {
      btIdx = i;
      break;
    }
  }
  if (btIdx < 0) return undefined;
  for (let i = btIdx; i < ops.length; i++) {
    if (ops[i]!.op === "ET") {
      etIdx = i;
      break;
    }
  }
  if (etIdx < 0) return undefined;
  return { blockStart: ops[btIdx]!.opStart, blockEnd: ops[etIdx]!.opEnd, ctx };
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3);
}

export function buildStyleAndShowReplacement(
  ctx: TextBlockContext,
  source: SpanSource,
  span: TextSpan,
  newBytes: Uint8Array,
  comp: number,
  opts: { newColor?: string; newSize?: number; newFontRef?: string }
): Uint8Array | undefined {
  let rgb = { ...ctx.fillRgb };

  if (opts.newColor) {
    const parsed = parseHexColor(opts.newColor);
    if (!parsed) return undefined;
    rgb = parsed;
  }

  let tfSize = ctx.fontSize;
  if (opts.newSize !== undefined) {
    const oldVisual = effectiveVisualSize(span);
    if (oldVisual > 0) {
      tfSize = ctx.fontSize * (opts.newSize / oldVisual);
    } else {
      tfSize = opts.newSize;
    }
  }

  const showPart = buildShowReplacement(source, newBytes, comp);
  const fontRef = opts.newFontRef ?? ctx.fontRef;
  const stylePrefix = asciiBytes(
    `/${fontRef} ${fmt(tfSize)} Tf ${fmt(rgb.r)} ${fmt(rgb.g)} ${fmt(rgb.b)} rg `
  );
  const pos = ctx.positionBytes.length ? concatBytes([ctx.positionBytes, asciiBytes(" ")]) : new Uint8Array(0);

  return concatBytes([stylePrefix, pos, showPart]);
}

export function styleChangeRequested(
  span: TextSpan,
  newColor?: string,
  newSize?: number,
  fontStyle?: { family?: string; bold?: boolean; italic?: boolean },
  original?: { color?: string; size?: number }
): boolean {
  if (newColor && original?.color !== undefined) {
    const parsed = parseHexColor(newColor);
    const origParsed = parseHexColor(original.color);
    if (parsed && origParsed && colorsDiffer(origParsed, parsed)) return true;
  } else if (newColor) {
    const parsed = parseHexColor(newColor);
    if (parsed && colorsDiffer(rgbaFromSpan(span), parsed)) return true;
  }
  if (newSize !== undefined && original?.size !== undefined) {
    if (Math.abs(newSize - original.size) > 0.01) return true;
  } else if (newSize !== undefined && Math.abs(newSize - effectiveVisualSize(span)) > 0.01) {
    return true;
  }
  if (fontStyle && span.fontDict?.type === "dict") {
    const baseFont = asName(dictGet(span.fontDict, "BaseFont")) ?? "";
    const parsed = parseFontVariant(baseFont);
    if (fontStyle.family && fontStyle.family.toLowerCase() !== parsed.name.toLowerCase()) {
      return true;
    }
    if (fontStyle.bold !== undefined && fontStyle.bold !== parsed.bold) return true;
    if (fontStyle.italic !== undefined && fontStyle.italic !== parsed.italic) return true;
  }
  return false;
}

export function fillColorToHex(c: RGBA): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
