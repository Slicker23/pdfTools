/**
 * Content-stream interpreter (M3 geometry + M4 advances).
 *
 * A graphics/text state machine over the tokenized operations. It tracks the
 * CTM and text state and emits one {@link TextSpan} per text-showing operator
 * (Tj/TJ/'/"), positioned in PDF page space. When a {@link Font} is available
 * (via `loadFont`), each glyph is measured: the text matrix advances by real
 * widths per ISO 32000-1 9.4.4 (including Tc/Tw/Tz and TJ adjustments) and each
 * span gains decoded Unicode, per-glyph positions, an end origin, and bounds.
 * With no font resolved it degrades to raw codes with width-free positioning.
 *
 * Form XObjects invoked with `Do` are interpreted recursively (with the form's
 * /Matrix concatenated onto the CTM), guarded against cycles and runaway depth.
 */
import { asName, asNumber, isString, type CosDict, type CosObject } from "../cos/types";
import { tokenizeContent } from "./tokenizer";
import { apply, IDENTITY, multiply, type Matrix } from "./matrix";
import type { Font } from "../fonts/types";
import type { RGBA, ShowItem, SpanGlyph, SpanSource, TextSpan } from "./types";

const MAX_FORM_DEPTH = 16;

/** FontMatrix for the shared 1000-units-per-em glyph space. */
const GLYPH_FONT_MATRIX: Matrix = [0.001, 0, 0, 0.001, 0, 0];
const DEFAULT_ASCENT = 750;
const DEFAULT_DESCENT = -250;

export interface XObjectInfo {
  subtype: "form" | "image";
  bytes?: Uint8Array;
  resources?: CosDict;
  matrix?: Matrix;
  /** Object number for cycle detection (optional). */
  id?: number;
}

export interface InterpretCtx {
  /** Initial CTM (defaults to identity = MediaBox-origin page space). */
  initialCtm?: Matrix;
  resources: CosDict;
  fontLookup: (resources: CosDict, name: string) => CosObject | undefined;
  xobjectLookup?: (resources: CosDict, name: string) => XObjectInfo | undefined;
  /** Build a measured Font from a resolved font dict (M4). */
  loadFont?: (fontDict: CosObject) => Font | undefined;
}

interface GState {
  ctm: Matrix;
  fill: RGBA;
  charSpacing: number;
  wordSpacing: number;
  hscale: number; // Tz / 100
  leading: number;
  fontRef: string;
  fontSize: number;
  fontDict?: CosObject;
  font?: Font;
  rise: number;
  renderMode: number;
}

function defaultGState(ctm: Matrix): GState {
  return {
    ctm,
    fill: { r: 0, g: 0, b: 0, a: 1 },
    charSpacing: 0,
    wordSpacing: 0,
    hscale: 1,
    leading: 0,
    fontRef: "",
    fontSize: 0,
    fontDict: undefined,
    font: undefined,
    rise: 0,
    renderMode: 0,
  };
}

function cloneGState(g: GState): GState {
  return { ...g, ctm: [...g.ctm] as Matrix, fill: { ...g.fill } };
}

function gray(v: number): RGBA {
  return { r: v, g: v, b: v, a: 1 };
}
function cmyk(c: number, m: number, y: number, k: number): RGBA {
  return { r: (1 - c) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k), a: 1 };
}

export function interpretContent(bytes: Uint8Array, ctx: InterpretCtx): TextSpan[] {
  const spans: TextSpan[] = [];
  const visited = new Set<number>();

  const run = (
    content: Uint8Array,
    resources: CosDict,
    seed: GState,
    depth: number,
    bufferId: number,
    stopBeforeOffset?: number
  ): boolean => {
    let gs = seed;
    const stack: GState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;

    const nextLine = (): void => {
      tlm = multiply([1, 0, 0, 1, 0, -gs.leading], tlm);
      tm = tlm;
    };

    // Show text and advance the text matrix per ISO 32000-1, 9.4.4. Measures each
    // glyph (page-space origin + advance), decodes Unicode, and records the pen
    // end position and axis-aligned bounds. `tm` is advanced in place.
    const emit = (codes: Uint8Array, items: ShowItem[], source?: SpanSource): void => {
      const fontSize = gs.fontSize;
      const th = gs.hscale;
      const textScale: Matrix = [fontSize * th, 0, 0, fontSize, 0, gs.rise];
      const trmStart = multiply(multiply(textScale, tm), gs.ctm);
      const origin = apply(trmStart, 0, 0);

      const font = gs.font;
      const glyphs: SpanGlyph[] = [];
      let text = "";
      let hasBBox = false;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let advTx = 0;
      const ascent = font?.ascent ?? DEFAULT_ASCENT;
      const descent = font?.descent ?? DEFAULT_DESCENT;

      const advance = (tx: number): void => {
        advTx += tx;
        tm = multiply([1, 0, 0, 1, tx, 0], tm);
      };

      for (const item of items) {
        if ("adjust" in item) {
          // TJ numeric: displacement is -adjust/1000 of text space, scaled by Tfs/Th.
          advance((-item.adjust / 1000) * fontSize * th);
          continue;
        }
        if (!font) continue; // no font resolved: keep codes/items, cannot measure
        for (const g of font.decode(item.bytes)) {
          const w0 = g.width / 1000;
          const isSpace = g.bytes.length === 1 && g.code === 32;
          const glyphOnly = w0 * fontSize * th;
          const tx = (w0 * fontSize + gs.charSpacing + (isSpace ? gs.wordSpacing : 0)) * th;

          const pageMatrix = multiply(tm, gs.ctm);
          const pen = apply(multiply(textScale, pageMatrix), 0, 0);
          const penAdv = apply(pageMatrix, glyphOnly, 0);
          const penBase = apply(pageMatrix, 0, 0);
          glyphs.push({
            unicode: g.unicode,
            x: pen.x,
            y: pen.y,
            width: penAdv.x - penBase.x,
          });
          if (g.unicode != null) text += g.unicode;

          // Bounds: transform the glyph box corners (glyph space) into page space.
          const gm = multiply(multiply(GLYPH_FONT_MATRIX, textScale), pageMatrix);
          const gw = g.width;
          for (const [cx, cy] of [
            [0, descent],
            [gw, descent],
            [0, ascent],
            [gw, ascent],
          ] as const) {
            const p = apply(gm, cx, cy);
            if (p.x < x0) x0 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.x > x1) x1 = p.x;
            if (p.y > y1) y1 = p.y;
            hasBBox = true;
          }
          advance(tx);
        }
      }

      const endTrm = multiply(multiply(textScale, tm), gs.ctm);
      const endOrigin = apply(endTrm, 0, 0);
      spans.push({
        origin,
        matrix: trmStart,
        fontRef: gs.fontRef,
        fontDict: gs.fontDict,
        fontSize,
        renderMode: gs.renderMode,
        fillColor: gs.fill,
        codes,
        items,
        text: font ? text : undefined,
        glyphs: font ? glyphs : undefined,
        endOrigin,
        rightEdge: endOrigin.x,
        bbox: hasBBox ? [x0, y0, x1, y1] : undefined,
        source: source ? { ...source, streamNum: bufferId } : undefined,
        advanceTx: advTx,
        charSpacing: gs.charSpacing,
        wordSpacing: gs.wordSpacing,
        hscale: th,
      });
    };

    const showFromArray = (arr: CosObject[], source?: SpanSource): void => {
      const items: ShowItem[] = [];
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (const el of arr) {
        if (isString(el)) {
          items.push({ bytes: el.bytes });
          chunks.push(el.bytes);
          total += el.bytes.length;
        } else {
          const adjust = asNumber(el);
          if (adjust != null) items.push({ adjust });
        }
      }
      const codes = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        codes.set(c, off);
        off += c.length;
      }
      emit(codes, items, source);
    };

    // Build an editing locator for a show operator: `regionStart..opEnd` is the
    // replaceable region (first operand through the operator keyword). streamNum
    // is a placeholder buffer id here; document.pageSpans resolves it to a real
    // content-stream object number and decoded-local offsets.
    const srcFor = (
      op: SpanSource["op"],
      operandsStart: number,
      opStart: number,
      opEnd: number,
      extra?: { aw: number; ac: number }
    ): SpanSource | undefined => {
      const regionStart = operandsStart >= 0 ? operandsStart : opStart;
      return { streamNum: bufferId, regionStart, regionEnd: opEnd, op, aw: extra?.aw, ac: extra?.ac };
    };

    for (const { op, operands, opStart, opEnd, operandsStart } of tokenizeContent(content)) {
      if (stopBeforeOffset != null && opStart >= stopBeforeOffset) {
        return true;
      }
      const n = (i: number): number => asNumber(operands[i]) ?? 0;
      switch (op) {
        // Graphics state
        case "q":
          stack.push(cloneGState(gs));
          break;
        case "Q":
          if (stack.length) gs = stack.pop()!;
          break;
        case "cm":
          gs.ctm = multiply([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm);
          break;

        // Fill color (basic)
        case "g":
          gs.fill = gray(n(0));
          break;
        case "rg":
          gs.fill = { r: n(0), g: n(1), b: n(2), a: 1 };
          break;
        case "k":
          gs.fill = cmyk(n(0), n(1), n(2), n(3));
          break;

        // Text object
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "ET":
          break;

        // Text state
        case "Tc":
          gs.charSpacing = n(0);
          break;
        case "Tw":
          gs.wordSpacing = n(0);
          break;
        case "Tz":
          gs.hscale = n(0) / 100;
          break;
        case "TL":
          gs.leading = n(0);
          break;
        case "Ts":
          gs.rise = n(0);
          break;
        case "Tr":
          gs.renderMode = n(0);
          break;
        case "Tf": {
          const name = asName(operands[0]);
          gs.fontRef = name ?? "";
          gs.fontSize = n(1);
          gs.fontDict = name ? ctx.fontLookup(resources, name) : undefined;
          gs.font = gs.fontDict && ctx.loadFont ? ctx.loadFont(gs.fontDict) : undefined;
          break;
        }

        // Text positioning
        case "Td":
          tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm);
          tm = tlm;
          break;
        case "TD":
          gs.leading = -n(1);
          tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm);
          tm = tlm;
          break;
        case "Tm":
          tlm = [n(0), n(1), n(2), n(3), n(4), n(5)];
          tm = tlm;
          break;
        case "T*":
          nextLine();
          break;

        // Text showing
        case "Tj": {
          const s = operands[0];
          if (isString(s)) emit(s.bytes, [{ bytes: s.bytes }], srcFor("Tj", operandsStart, opStart, opEnd));
          break;
        }
        case "TJ": {
          const arr = operands[0];
          if (arr && arr.type === "array")
            showFromArray(arr.items, srcFor("TJ", operandsStart, opStart, opEnd));
          break;
        }
        case "'": {
          nextLine();
          const s = operands[0];
          if (isString(s)) emit(s.bytes, [{ bytes: s.bytes }], srcFor("'", operandsStart, opStart, opEnd));
          break;
        }
        case '"': {
          const aw = n(0);
          const ac = n(1);
          gs.wordSpacing = aw;
          gs.charSpacing = ac;
          nextLine();
          const s = operands[2];
          if (isString(s))
            emit(s.bytes, [{ bytes: s.bytes }], srcFor('"', operandsStart, opStart, opEnd, { aw, ac }));
          break;
        }

        // XObjects
        case "Do": {
          const name = asName(operands[0]);
          if (!name || !ctx.xobjectLookup) break;
          const xo = ctx.xobjectLookup(resources, name);
          if (!xo || xo.subtype !== "form" || !xo.bytes) break;
          if (depth >= MAX_FORM_DEPTH) break;
          if (xo.id != null) {
            if (visited.has(xo.id)) break;
            visited.add(xo.id);
          }
          const childSeed = cloneGState(gs);
          childSeed.ctm = multiply(xo.matrix ?? IDENTITY, gs.ctm);
          if (run(xo.bytes, xo.resources ?? resources, childSeed, depth + 1, xo.id ?? -2)) {
            if (xo.id != null) visited.delete(xo.id);
            return true;
          }
          if (xo.id != null) visited.delete(xo.id);
          break;
        }

        default:
          break;
      }
    }
    return false;
  };

  run(bytes, ctx.resources, defaultGState(ctx.initialCtm ?? IDENTITY), 0, -1);
  return spans;
}

/** Graphics-state CTM immediately before the operator at `stopBeforeOffset`. */
export function contentStateAtOffset(
  bytes: Uint8Array,
  stopBeforeOffset: number,
  ctx: InterpretCtx
): Matrix {
  let ctm: Matrix = ctx.initialCtm ?? IDENTITY;
  const visited = new Set<number>();

  const run = (
    content: Uint8Array,
    resources: CosDict,
    seed: GState,
    depth: number,
    stopBeforeOffset: number
  ): boolean => {
    let gs = seed;
    const stack: GState[] = [];
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;

    const nextLine = (): void => {
      tlm = multiply([1, 0, 0, 1, 0, -gs.leading], tlm);
      tm = tlm;
    };

    for (const { op, operands, opStart, opEnd, operandsStart } of tokenizeContent(content)) {
      if (opStart >= stopBeforeOffset) {
        ctm = gs.ctm;
        return true;
      }
      const n = (i: number): number => asNumber(operands[i]) ?? 0;
      switch (op) {
        case "q":
          stack.push(cloneGState(gs));
          break;
        case "Q":
          if (stack.length) gs = stack.pop()!;
          break;
        case "cm":
          gs.ctm = multiply([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm);
          break;
        case "g":
          gs.fill = gray(n(0));
          break;
        case "rg":
          gs.fill = { r: n(0), g: n(1), b: n(2), a: 1 };
          break;
        case "k":
          gs.fill = cmyk(n(0), n(1), n(2), n(3));
          break;
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "ET":
          break;
        case "Tc":
          gs.charSpacing = n(0);
          break;
        case "Tw":
          gs.wordSpacing = n(0);
          break;
        case "Tz":
          gs.hscale = n(0) / 100;
          break;
        case "TL":
          gs.leading = n(0);
          break;
        case "Ts":
          gs.rise = n(0);
          break;
        case "Tr":
          gs.renderMode = n(0);
          break;
        case "Tf": {
          const name = asName(operands[0]);
          gs.fontRef = name ?? "";
          gs.fontSize = n(1);
          gs.fontDict = name ? ctx.fontLookup(resources, name) : undefined;
          gs.font = gs.fontDict && ctx.loadFont ? ctx.loadFont(gs.fontDict) : undefined;
          break;
        }
        case "Td":
          tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm);
          tm = tlm;
          break;
        case "TD":
          gs.leading = -n(1);
          tlm = multiply([1, 0, 0, 1, n(0), n(1)], tlm);
          tm = tlm;
          break;
        case "Tm":
          tlm = [n(0), n(1), n(2), n(3), n(4), n(5)];
          tm = tlm;
          break;
        case "T*":
          nextLine();
          break;
        case "Tj":
        case "TJ":
        case "'":
        case '"':
          break;
        case "Do": {
          const name = asName(operands[0]);
          if (!name || !ctx.xobjectLookup) break;
          const xo = ctx.xobjectLookup(resources, name);
          if (!xo || xo.subtype !== "form" || !xo.bytes) break;
          if (depth >= MAX_FORM_DEPTH) break;
          if (xo.id != null) {
            if (visited.has(xo.id)) break;
            visited.add(xo.id);
          }
          const childSeed = cloneGState(gs);
          childSeed.ctm = multiply(xo.matrix ?? IDENTITY, gs.ctm);
          if (run(xo.bytes, xo.resources ?? resources, childSeed, depth + 1, stopBeforeOffset)) {
            if (xo.id != null) visited.delete(xo.id);
            return true;
          }
          if (xo.id != null) visited.delete(xo.id);
          break;
        }
        default:
          break;
      }
    }
    ctm = gs.ctm;
    return false;
  };

  run(bytes, ctx.resources, defaultGState(ctx.initialCtm ?? IDENTITY), 0, stopBeforeOffset);
  return ctm;
}
