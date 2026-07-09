/**
 * Native-only PDF patch apply (CosDocument engine, no pdf-lib).
 */
import type { PdfEditBlockPatch, PdfEditPatch } from "@/lib/pdf/edit-model";
import type { PlatformAdapters } from "./core/platform";
export interface ApplyNativeResult {
    output: Uint8Array;
    overlayBlocks: PdfEditBlockPatch[];
}
/**
 * Apply native engine operations only. Blocks that need pdf-lib overlay are
 * returned in `overlayBlocks` for a follow-up `applyOverlayPatch` call.
 */
export declare function applyNativePatch(input: Uint8Array, patch: PdfEditPatch, adapters: PlatformAdapters): Promise<ApplyNativeResult>;
//# sourceMappingURL=apply-native.d.ts.map