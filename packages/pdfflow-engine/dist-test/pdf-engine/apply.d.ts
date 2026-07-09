import type { PdfEditPatch } from "@/lib/pdf/edit-model";
/**
 * Apply a PdfEditPatch. Blocks that carry a native `locator` are edited in place
 * via the from-scratch engine (incremental update, original font reused). Blocks
 * without a locator - or ones the engine declines (encrypted / unencodable /
 * not-found) - fall back to the pdf-lib whiteout+redraw overlay.
 */
export declare function applyPatch(input: Buffer, patch: PdfEditPatch): Promise<Buffer>;
//# sourceMappingURL=apply.d.ts.map