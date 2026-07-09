import type { PdfEditPatch } from "../pdf/edit-model";
import { applyFullPatch } from "./apply-full";
import { nodeOverlayPlatform } from "./apply-overlay-node";
import { nodeAdapters } from "./node/platform-node";

/**
 * Apply a PdfEditPatch. Blocks that carry a native `locator` are edited in place
 * via the from-scratch engine (incremental update, original font reused). Blocks
 * without a locator - or ones the engine declines (encrypted / unencodable /
 * not-found) - fall back to the pdf-lib whiteout+redraw overlay.
 */
export async function applyPatch(input: Buffer, patch: PdfEditPatch): Promise<Buffer> {
  const output = await applyFullPatch(
    new Uint8Array(input),
    patch,
    nodeAdapters,
    nodeOverlayPlatform
  );
  return Buffer.from(output);
}
