/**
 * Browser-side full text patch apply (outside React hooks).
 */
import type { PdfEditBlockPatch, PdfEditPatch } from "@/lib/pdf/edit-model";
import { applyFullPatch, applyOverlayFull } from "../apply-full";
import { createBrowserOverlayPlatform } from "../apply-overlay-browser";
import { browserAdapters } from "./platform-browser";
import { sampleOverlayBackgroundsAllPages } from "./sample-bg-browser";

export async function applyOverlayForBlockIdsInBrowser(
  nativeBytes: Uint8Array,
  patch: PdfEditPatch,
  blockIds: string[]
): Promise<Uint8Array> {
  const idSet = new Set(blockIds);
  const overlayBlocks = patch.blocks.filter((b) => idSet.has(b.id));
  if (!overlayBlocks.length) return nativeBytes;
  return applyOverlayFull(
    nativeBytes,
    overlayBlocks,
    browserAdapters,
    createBrowserOverlayPlatform(),
    sampleOverlayBackgroundsAllPages
  );
}

export async function applyTextPatchInBrowser(
  input: Uint8Array,
  patch: PdfEditPatch
): Promise<Uint8Array> {
  return applyFullPatch(
    input,
    patch,
    browserAdapters,
    createBrowserOverlayPlatform(),
    sampleOverlayBackgroundsAllPages
  );
}
