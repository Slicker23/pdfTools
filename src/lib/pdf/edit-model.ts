import { z } from "zod";

export const EDIT_MODEL_VERSION = 1 as const;

export const pdfEditBBoxSchema = z.object({
  px: z.number(),
  py: z.number(),
  pw: z.number(),
  ph: z.number(),
});

export const pdfEditFontSchema = z.object({
  name: z.string(),
  size: z.number(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  color: z.string().default("#111111"),
  embeddedFontRef: z.string().optional(),
});

export const pdfEditTextBlockSchema = z.object({
  id: z.string(),
  page: z.number().int().min(1),
  text: z.string(),
  bbox: pdfEditBBoxSchema,
  font: pdfEditFontSchema,
  lineCount: z.number().int().min(1).default(1),
  baselineY: z.number().optional(),
  modified: z.boolean().optional(),
  deleted: z.boolean().optional(),
  /**
   * Native-edit locator (M5): identifies the exact content-stream run this block
   * came from (`p{page}:s{streamNum}:o{offset}`). Present only for runs the
   * engine can edit in place; blocks without it fall back to the overlay apply.
   */
  locator: z.string().optional(),
  /**
   * When true the block must be applied via the pdf-lib whiteout+redraw overlay
   * even if it has a native `locator`. Set by the editor when a style change
   * (font / size / colour / bold / italic) is requested, since the native
   * in-place engine only rewrites the text codes and reuses the original font.
   */
  overlay: z.boolean().optional(),
  /** Characters encodable by the embedded font subset (for client overlay prediction). */
  encodableChars: z.string().optional(),
  /** User-created block (not from extract); applied via native insert. */
  created: z.boolean().optional(),
  insertAt: z
    .object({
      px: z.number(),
      py: z.number(),
    })
    .optional(),
  /** Extract-time bbox when the block was moved — used to repaint the source region. */
  originalBbox: pdfEditBBoxSchema.optional(),
  /** Extract-time font when color/size changed — native apply uses this as the style baseline. */
  originalFont: pdfEditFontSchema.optional(),
  /** Convert this text run to vector paths on download (M6). */
  flattenToPath: z.boolean().optional(),
  /** True when the embedded font program exposes glyph outlines (M6). */
  supportsOutlines: z.boolean().optional(),
  /**
   * When extract merged multiple PDF show operators into one block, each
   * original run is listed here for native strip on overlay apply.
   */
  segments: z
    .array(
      z.object({
        locator: z.string(),
        text: z.string(),
        bbox: pdfEditBBoxSchema,
      })
    )
    .optional(),
});

export const pdfEditPageSchema = z.object({
  number: z.number().int().min(1),
  width: z.number(),
  height: z.number(),
  blocks: z.array(pdfEditTextBlockSchema),
});

export const pdfEditDocumentSchema = z.object({
  version: z.literal(EDIT_MODEL_VERSION),
  documentId: z.string(),
  pages: z.array(pdfEditPageSchema),
});

export const pdfEditBlockPatchSchema = pdfEditTextBlockSchema
  .partial()
  .required({ id: true, page: true });

export const pdfEditPatchSchema = z.object({
  documentId: z.string(),
  blocks: z.array(pdfEditBlockPatchSchema),
});

export type PdfEditBBox = z.infer<typeof pdfEditBBoxSchema>;
export type PdfEditFont = z.infer<typeof pdfEditFontSchema>;
export type PdfEditTextBlock = z.infer<typeof pdfEditTextBlockSchema>;
export type PdfEditPage = z.infer<typeof pdfEditPageSchema>;
export type PdfEditDocument = z.infer<typeof pdfEditDocumentSchema>;
export type PdfEditBlockPatch = z.infer<typeof pdfEditBlockPatchSchema>;
export type PdfEditPatch = z.infer<typeof pdfEditPatchSchema>;

export function parsePdfEditDocument(data: unknown): PdfEditDocument {
  return pdfEditDocumentSchema.parse(data);
}

export function parsePdfEditPatch(data: unknown): PdfEditPatch {
  return pdfEditPatchSchema.parse(data);
}

export function buildPdfEditPatch(
  document: PdfEditDocument,
  blocks: PdfEditTextBlock[]
): PdfEditPatch {
  const changed = blocks.filter((b) => b.modified || b.deleted || b.created);
  return {
    documentId: document.documentId,
    blocks: changed.map((b) => ({
      id: b.id,
      page: b.page,
      text: b.text,
      bbox: b.bbox,
      font: b.font,
      lineCount: b.lineCount,
      baselineY: b.baselineY,
      modified: b.modified,
      deleted: b.deleted,
      locator: b.locator,
      overlay: b.overlay,
      encodableChars: b.encodableChars,
      created: b.created,
      insertAt: b.insertAt,
      originalBbox: b.originalBbox,
      originalFont: b.originalFont,
      flattenToPath: b.flattenToPath,
      supportsOutlines: b.supportsOutlines,
      segments: b.segments,
    })),
  };
}
