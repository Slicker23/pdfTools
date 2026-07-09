import { type PdfEditDocument } from "@/lib/pdf/edit-model";
/**
 * Extract a PDF into the editable document model using the from-scratch engine
 * (M5). Adjacent same-line show operators with matching style are merged into
 * one block; each block's `locator` pins the primary run for native apply, and
 * `segments` lists every merged run when a phrase was split in the PDF.
 */
export declare function extractDocument(input: Buffer): Promise<PdfEditDocument>;
//# sourceMappingURL=extract.d.ts.map