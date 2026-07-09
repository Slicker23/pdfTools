import type { PdfEditDocument, PdfEditPatch } from "../pdf/edit-model";
import { parsePdfEditDocument } from "../pdf/edit-model";
import { applyPatch } from "./apply";
import { extractDocument } from "./extract";

export const PDF_ENGINE_SETUP_HINT = "Run: npm install (the PDF engine is bundled with the app)";

/** Extract PDF → PdfEditDocument via the from-scratch engine (native, in-process). */
export async function pdfEngineExtract(input: Buffer): Promise<PdfEditDocument> {
  const doc = await extractDocument(input);
  return parsePdfEditDocument(doc);
}

/** Apply PdfEditPatch to PDF: native in-place edits + pdf-lib overlay fallback. */
export async function pdfEngineApply(
  input: Buffer,
  patch: PdfEditPatch
): Promise<Buffer> {
  return applyPatch(input, patch);
}

export {
  predictBlockApply,
  type ApplyPlan,
  type ApplyStrategy,
  type BlockOriginalSnapshot,
  type OverlayReason,
} from "./plan";
export { applyNativePatch, type ApplyNativeResult } from "./apply-native";
export { applyOverlayPatch, applyOverlayWithNativeStrip } from "./apply-overlay";

/** Verify PDF engine modules load (pdf-lib is used for the overlay fallback). */
export async function pdfEngineConfigured(): Promise<boolean> {
  try {
    await import("pdf-lib");
    return true;
  } catch {
    return false;
  }
}
