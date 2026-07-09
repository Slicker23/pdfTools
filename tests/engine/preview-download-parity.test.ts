import { describe, expect, it } from "vitest";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import { applyPatch } from "../../src/lib/pdf-engine/apply";
import { applyFullPatch } from "../../src/lib/pdf-engine/apply-full";
import { isOverlayBlock } from "../../src/lib/pdf-engine/plan";
import { pdfEngineExtract } from "../../src/lib/pdf-engine/run";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { nodeOverlayPlatform } from "../../src/lib/pdf-engine/apply-overlay-node";
import { loadFixture } from "./util";

function blockTexts(doc: Awaited<ReturnType<typeof pdfEngineExtract>>): string[] {
  return doc.pages.flatMap((p) => p.blocks.map((b) => b.text));
}

describe("preview/download parity (full apply)", () => {
  it("matches server applyPatch for native + overlay edits", async () => {
    const input = loadFixture("cv-like.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 5);
    expect(block).toBeDefined();

    const nativeBlock: PdfEditBlockPatch = {
      id: block!.id,
      page: block!.page,
      text: "Edited",
      bbox: block!.bbox,
      font: { ...block!.font, color: "#ff0000", size: (block!.font.size ?? 12) + 2 },
      locator: block!.locator,
      encodableChars: block!.encodableChars,
      modified: true,
    };

    const styleBlock = doc.pages
      .flatMap((p) => p.blocks)
      .find((b) => b.locator && b.id !== block!.id && b.text.length >= 3);
    expect(styleBlock).toBeDefined();

    const overlayBlock: PdfEditBlockPatch = {
      id: styleBlock!.id,
      page: styleBlock!.page,
      text: styleBlock!.text,
      bbox: styleBlock!.bbox,
      font: { ...styleBlock!.font, name: "Times-Roman" },
      locator: styleBlock!.locator,
      encodableChars: styleBlock!.encodableChars,
      modified: true,
      overlay: true,
    };
    expect(isOverlayBlock(overlayBlock)).toBe(true);

    const patch = { documentId: doc.documentId, blocks: [nativeBlock, overlayBlock] };

    const serverOut = await applyPatch(Buffer.from(input), patch);
    const browserSim = await applyFullPatch(
      input,
      patch,
      nodeAdapters,
      nodeOverlayPlatform,
      async (_bytes, blocks) => {
        const map = new Map<string, { r: number; g: number; b: number }>();
        for (const b of blocks) map.set(b.id, { r: 1, g: 1, b: 1 });
        return map;
      }
    );

    const serverDoc = await pdfEngineExtract(serverOut);
    const browserDoc = await pdfEngineExtract(Buffer.from(browserSim));

    expect(blockTexts(browserDoc).filter((t) => t.includes("Edited")).length).toBeGreaterThan(0);
    expect(blockTexts(serverDoc).filter((t) => t.includes("Edited")).length).toBeGreaterThan(0);

    const serverOverlayish = serverDoc.pages.flatMap((p) => p.blocks).length;
    const browserOverlayish = browserDoc.pages.flatMap((p) => p.blocks).length;
    expect(Math.abs(serverOverlayish - browserOverlayish)).toBeLessThanOrEqual(2);
  });
});
