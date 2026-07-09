import type { PdfEditDocument, PdfEditPatch } from "@/lib/pdf/edit-model";
export declare const PDF_ENGINE_SETUP_HINT = "Run: npm install (the PDF engine is bundled with the app)";
/** Extract PDF → PdfEditDocument via the from-scratch engine (native, in-process). */
export declare function pdfEngineExtract(input: Buffer): Promise<PdfEditDocument>;
/** Apply PdfEditPatch to PDF: native in-place edits + pdf-lib overlay fallback. */
export declare function pdfEngineApply(input: Buffer, patch: PdfEditPatch): Promise<Buffer>;
export { predictBlockApply, type ApplyPlan, type ApplyStrategy, type BlockOriginalSnapshot, type OverlayReason, } from "./plan";
export { applyNativePatch, type ApplyNativeResult } from "./apply-native";
export { applyOverlayPatch, applyOverlayWithNativeStrip } from "./apply-overlay";
/** Verify PDF engine modules load (pdf-lib is used for the overlay fallback). */
export declare function pdfEngineConfigured(): Promise<boolean>;
//# sourceMappingURL=run.d.ts.map