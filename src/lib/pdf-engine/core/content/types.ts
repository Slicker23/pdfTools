/** Content-interpreter output types (M3). */
import type { CosObject } from "../cos/types";
import type { Matrix } from "./matrix";

export interface RGBA {
  r: number; // 0..1
  g: number;
  b: number;
  a: number;
}

/** One element of a TJ array: a shown string or a numeric position adjustment. */
export type ShowItem = { bytes: Uint8Array } | { adjust: number };

/** A measured glyph within a span: page-space pen origin, advance, and Unicode. */
export interface SpanGlyph {
  /** Decoded Unicode text for this glyph, if resolvable. */
  unicode?: string;
  /** Page-space x of the glyph's pen origin. */
  x: number;
  /** Page-space y of the glyph's pen origin. */
  y: number;
  /** Advance along the text baseline in page space (x-extent for LTR text). */
  width: number;
}

/**
 * One text-showing operation (Tj / TJ / ' / "), positioned and measured.
 *
 * `origin` and `matrix` are in PDF page space (points, origin at the MediaBox
 * lower-left). `matrix` is the text rendering matrix at the start of the show
 * (text space -> page space); `origin = apply(matrix, 0, 0)`.
 *
 * M4 adds glyph advances and Unicode: `text` is the decoded string, `glyphs`
 * carry per-glyph positions/widths, `endOrigin` is the pen position after the
 * show, `rightEdge` is its page-space x, and `bbox` is the axis-aligned bounds.
 */
export interface TextSpan {
  origin: { x: number; y: number };
  matrix: Matrix;
  /** Resource name of the font (e.g. "F1"). */
  fontRef: string;
  /** Resolved font dictionary, if the resource was found. */
  fontDict?: CosObject;
  /** Nominal /Tf size (page-space scale is folded into `matrix`). */
  fontSize: number;
  /** Text render mode (Tr): 0 fill, 1 stroke, 3 invisible, 7 clip, etc. */
  renderMode: number;
  /** Approximate fill color (from g/rg/k); undefined if never set. */
  fillColor?: RGBA;
  /** Concatenated raw shown bytes (character codes, pre-encoding). */
  codes: Uint8Array;
  /** Structured TJ items (strings + numeric adjustments); single string for Tj. */
  items: ShowItem[];
  /** Decoded Unicode text (requires a resolved font). */
  text?: string;
  /** Per-glyph measured positions and advances. */
  glyphs?: SpanGlyph[];
  /** Pen position after the show (page space). */
  endOrigin?: { x: number; y: number };
  /** Page-space x of the pen after the show. */
  rightEdge?: number;
  /** Axis-aligned page-space bounds [x0, y0, x1, y1]. */
  bbox?: [number, number, number, number];
  /** Editing locator (editable direct page-content runs only; M5). */
  source?: SpanSource;
  /** Total text-space horizontal advance of the run (for edit compensation). */
  advanceTx?: number;
  /** Text state at the show (for recomputing advance on edit). */
  charSpacing?: number;
  wordSpacing?: number;
  hscale?: number;
}

/**
 * Editing locator for a text-showing run (M5). Present only for editable runs in
 * a page's direct content streams (not Form XObjects). `regionStart`/`regionEnd`
 * are byte offsets in the *decoded* content stream `streamNum`, spanning the
 * replaceable operator region (first operand through the operator keyword).
 */
export interface SpanSource {
  streamNum: number;
  regionStart: number;
  regionEnd: number;
  op: "Tj" | "TJ" | "'" | '"';
  /** For the `"` operator: word/char spacing operands to preserve on rewrite. */
  aw?: number;
  ac?: number;
}

export interface PageTextContent {
  spans: TextSpan[];
}
