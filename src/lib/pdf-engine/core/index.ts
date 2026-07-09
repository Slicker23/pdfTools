/**
 * Public API for the from-scratch PDF engine core.
 *
 * Covers the read layer (M0: COS objects, xref, decrypt), the full filter set
 * (M1), document structure (M2: page tree with inheritance, page resources,
 * decoded content-stream access), the content-stream interpreter (M3:
 * positioned text spans), and the font layer (M4: glyph advances + Unicode).
 *
 * This module is isomorphic: it never imports Node or browser built-ins. Provide
 * an `inflate` adapter (see ../node/platform-node.ts for Node) to open a
 * document.
 */
export * from "./cos/types";
export { Lexer } from "./cos/lexer";
export type { Token, TokenKind } from "./cos/lexer";
export { ObjectParser, parseCosObject } from "./cos/object-parser";
export type { IndirectObject, RefResolver } from "./cos/object-parser";
export { serializeCosObject, serializeIndirectObject } from "./cos/serialize";
export { flateDecode } from "./filters/flate";
export { applyPredictor, normalizePredictorParams } from "./filters/predictors";
export type { PredictorParams } from "./filters/predictors";
export { parseObjectStream } from "./objstm";
export { buildXref, readStartXref } from "./xref/build";
export type { XrefEntry, XrefResult } from "./xref/entries";
export { CosDocument } from "./document";
export type { OpenOptions, PageNode } from "./document";
export {
  RESOURCE_CATEGORIES,
  resourceCategory,
  lookupResource,
  listResourceEntries,
} from "./resources";
export type { ResourceCategory } from "./resources";
export { tokenizeContent } from "./content/tokenizer";
export type { ContentOp } from "./content/tokenizer";
export { interpretContent, contentStateAtOffset } from "./content/interpreter";
export type { InterpretCtx, XObjectInfo } from "./content/interpreter";
export { IDENTITY, apply, multiply, invert } from "./content/matrix";
export type { Matrix } from "./content/matrix";
export type { PageTextContent, RGBA, ShowItem, SpanGlyph, SpanSource, TextSpan } from "./content/types";
export { loadFont } from "./fonts/font";
export type { EncodeResult, Font, Glyph, StreamBytes } from "./fonts/types";
export { glyphNameToUnicode, resolveSimpleEncoding, baseEncodingFromName } from "./fonts/encoding";
export type { SimpleEncoding, EncodingParams } from "./fonts/encoding";
export { parseToUnicode } from "./fonts/tounicode";
export type { ToUnicodeMap } from "./fonts/tounicode";
export { identityCMap, predefinedCMap, parseCMapStream } from "./fonts/cmap";
export type { CMap, DecodedCode } from "./fonts/cmap";
export { mapBase14 } from "./fonts/base14";
export { writeIncrementalUpdate } from "./writer/incremental";
export type { IncrementalObject, WriteIncrementalOptions } from "./writer/incremental";
export {
  buildStyleAndShowReplacement,
  discoverTextBlockContext,
  effectiveVisualSize,
  fillColorToHex,
  styleChangeRequested,
} from "./editor/edit-style";
export { buildShowReplacement, spliceStream } from "./editor/edit-run";
export type { StreamEdit } from "./editor/edit-run";
export {
  editText,
  editTextBytes,
  encodeLocator,
  decodeLocator,
} from "./editor/edit-text";
export type { EditLocator, EditResult, SkipReason, TextEdit } from "./editor/edit-text";
export { insertTextBlocks } from "./editor/insert-text";
export type { InsertResult } from "./editor/insert-text";
export {
  relocateTextRuns,
  relocateTextRunsBytes,
} from "./editor/relocate-text";
export type { MoveResult, TextMove } from "./editor/relocate-text";
export {
  flattenTextRuns,
  flattenTextRunsBytes,
} from "./editor/flatten-text";
export type { FlattenResult, TextFlatten } from "./editor/flatten-text";
export { spanToPathContent, spanOutlineBBox, segmentsToSvgD } from "./editor/text-to-path";
export { getBlockOutlinePaths, collectSpanOutlinePaths } from "./editor/outline-preview";
export { loadOutlineFont } from "./fonts/outline-font";
export type { OutlineFont } from "./fonts/outline-font";
export { parseTrueType } from "./fonts/outlines/ttf";
export type { TrueTypeFace } from "./fonts/outlines/ttf";
export { parseCff, parseFontProgram } from "./fonts/outlines/cff";
export type { CffFont } from "./fonts/outlines/cff";
export { outlineBBox } from "./fonts/outlines/types";
export type { GlyphOutline, PathSegment } from "./fonts/outlines/types";
export type { DeflateFn, InflateFn, PlatformAdapters } from "./platform";
