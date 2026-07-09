/**
 * Shared full apply: native engine + optional overlay with bg sampling.
 */
import type { PdfEditBlockPatch, PdfEditPatch } from "../pdf/edit-model";
import { applyNativePatch } from "./apply-native";
import {
  applyOverlayWithNativeStrip,
  type OverlayPlatform,
  type Rgb01,
} from "./apply-overlay";
import { createBrowserOverlayPlatform } from "./apply-overlay-browser";
import type { PlatformAdapters } from "./core/platform";

export type BgSampler = (
  nativeBytes: Uint8Array,
  overlayBlocks: PdfEditBlockPatch[]
) => Promise<Map<string, Rgb01>>;

function platformWithBgSamples(
  platform: OverlayPlatform,
  samples: Map<string, Rgb01>
): OverlayPlatform {
  const fallback = createBrowserOverlayPlatform(samples);
  return {
    sampleBgRgb: async (input, pageIdx, bbox, pageHeight, blockId) => {
      if (blockId && samples.has(blockId)) return samples.get(blockId)!;
      return fallback.sampleBgRgb(input, pageIdx, bbox, pageHeight, blockId);
    },
    loadUnicodeFont: (pdfDoc) => platform.loadUnicodeFont(pdfDoc),
  };
}

/** Apply overlay blocks on top of already-native bytes. */
export async function applyOverlayFull(
  nativeBytes: Uint8Array,
  overlayBlocks: PdfEditBlockPatch[],
  adapters: PlatformAdapters,
  platform: OverlayPlatform,
  bgSampler?: BgSampler
): Promise<Uint8Array> {
  if (!overlayBlocks.length) return nativeBytes;

  let overlayPlatform = platform;
  if (bgSampler) {
    const samples = await bgSampler(nativeBytes, overlayBlocks);
    overlayPlatform = platformWithBgSamples(platform, samples);
  }

  return applyOverlayWithNativeStrip(
    nativeBytes,
    overlayBlocks,
    overlayPlatform,
    adapters
  );
}

/** Native apply + overlay fallback with optional pre-sampled backgrounds. */
export async function applyFullPatch(
  input: Uint8Array,
  patch: PdfEditPatch,
  adapters: PlatformAdapters,
  platform: OverlayPlatform,
  bgSampler?: BgSampler
): Promise<Uint8Array> {
  const { output, overlayBlocks } = await applyNativePatch(input, patch, adapters);
  return applyOverlayFull(output, overlayBlocks, adapters, platform, bgSampler);
}
