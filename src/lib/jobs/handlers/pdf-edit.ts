import type { PdfEditPatch } from "@/lib/pdf/edit-model";
import { pdfEngineApply, pdfEngineExtract } from "@/lib/pdf-engine/run";

export async function handlePdfEditExtractJob(input: Buffer): Promise<Buffer> {
  const doc = await pdfEngineExtract(input);
  return Buffer.from(JSON.stringify(doc), "utf-8");
}

export interface PdfEditApplyMetadata {
  patch: PdfEditPatch;
}

export async function handlePdfEditApplyJob(
  input: Buffer,
  metadata: PdfEditApplyMetadata
): Promise<Buffer> {
  if (!metadata.patch?.blocks?.length) {
    return input;
  }
  return pdfEngineApply(input, metadata.patch);
}
