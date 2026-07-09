/**
 * Shared full apply: native engine + optional overlay with bg sampling.
 */
import type { PdfEditBlockPatch, PdfEditPatch } from "@/lib/pdf/edit-model";
import { type OverlayPlatform, type Rgb01 } from "./apply-overlay";
import type { PlatformAdapters } from "./core/platform";
export type BgSampler = (nativeBytes: Uint8Array, overlayBlocks: PdfEditBlockPatch[]) => Promise<Map<string, Rgb01>>;
/** Apply overlay blocks on top of already-native bytes. */
export declare function applyOverlayFull(nativeBytes: Uint8Array, overlayBlocks: PdfEditBlockPatch[], adapters: PlatformAdapters, platform: OverlayPlatform, bgSampler?: BgSampler): Promise<Uint8Array>;
/** Native apply + overlay fallback with optional pre-sampled backgrounds. */
export declare function applyFullPatch(input: Uint8Array, patch: PdfEditPatch, adapters: PlatformAdapters, platform: OverlayPlatform, bgSampler?: BgSampler): Promise<Uint8Array>;
//# sourceMappingURL=apply-full.d.ts.map