/**
 * Font-layer types (M4).
 *
 * A {@link Font} resolves character codes (the raw bytes shown by Tj/TJ/'/") into
 * {@link Glyph}s carrying the glyph advance width and decoded Unicode text. Widths
 * are always expressed in glyph space (1000 units per em), matching PDF /Widths
 * and AFM metrics, so the interpreter's advance math (ISO 32000-1 9.4.4) divides
 * by 1000 uniformly regardless of the font program.
 */

export interface Glyph {
  /** Character code (integer value of `bytes`; 0-255 for simple fonts). */
  code: number;
  /** CID, for Type0/CIDFonts (undefined for simple fonts). */
  cid?: number;
  /** Glyph index in the embedded font program, when outlines are available (M6). */
  gid?: number;
  /** Decoded Unicode text for this code, if resolvable. */
  unicode?: string;
  /** Advance width in glyph space (1000 units per em). */
  width: number;
  /** The raw byte(s) this glyph was decoded from (1 for simple, N for Type0). */
  bytes: Uint8Array;
}

/** Result of encoding Unicode text back into this font's character codes (M5). */
export interface EncodeResult {
  /** Raw code bytes for the encodable characters, ready to place in a show op. */
  bytes: Uint8Array;
  /** Per-character code values (same order, encodable characters only). */
  codes: number[];
  /** Characters (as strings) with no code in this font's encoding/subset. */
  unencodable: string[];
}

export interface Font {
  subtype: string;
  isType0: boolean;
  /** Split raw shown bytes into positioned glyphs (code + width + unicode). */
  decode(codes: Uint8Array): Glyph[];
  /**
   * Encode Unicode text into this font's character codes for in-place editing
   * (M5). Present only when the font supports reverse mapping (simple fonts, or
   * Type0 with an invertible /ToUnicode). Characters absent from the font's
   * existing encoding/subset are reported in `unencodable`.
   */
  encode?(text: string): EncodeResult;
  /** Advance width of a single code in glyph space (1000 units per em). */
  widthOfCode(code: number): number;
  /** Default width for codes with no explicit metric (glyph space). */
  missingWidth: number;
  /** Ascent in glyph space (1000 units per em), if known. */
  ascent?: number;
  /** Descent in glyph space (1000 units per em; negative below baseline). */
  descent?: number;
  /** Font bounding box in glyph space [x0,y0,x1,y1], if known. */
  fontBBox?: [number, number, number, number];
}

/** Synchronous accessor for a pre-decoded stream body (keyed by object identity). */
export type StreamBytes = (stream: import("../cos/types").CosObject) => Uint8Array | undefined;
