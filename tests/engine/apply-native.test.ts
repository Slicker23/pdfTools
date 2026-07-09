import { describe, expect, it } from "vitest";
import type { PdfEditPatch } from "../../src/lib/pdf/edit-model";
import { applyPatch } from "../../src/lib/pdf-engine/apply";
import { applyNativePatch } from "../../src/lib/pdf-engine/apply-native";
import { applyOverlayWithNativeStrip } from "../../src/lib/pdf-engine/apply-overlay";
import { nodeOverlayPlatform } from "../../src/lib/pdf-engine/apply-overlay-node";
import { pdfEngineExtract } from "../../src/lib/pdf-engine/run";
import { CosDocument, decodeLocator } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { isOverlayBlock, predictBlockApply } from "../../src/lib/pdf-engine/plan";
import { loadFixture } from "./util";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("applyNativePatch", () => {
  it("returns empty overlay list for in-place text edit", async () => {
    const input = loadFixture("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 3);
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: "Hi",
          bbox: block!.bbox,
          font: block!.font,
          locator: block!.locator,
          encodableChars: block!.encodableChars,
          modified: true,
        },
      ],
    };

    const plan = predictBlockApply(patch.blocks[0]!, {
      text: block!.text,
      font: block!.font,
      bbox: block!.bbox,
    });
    expect(plan.strategy).toBe("native-in-place");

    const { output, overlayBlocks } = await applyNativePatch(input, patch, nodeAdapters);
    expect(overlayBlocks).toHaveLength(0);

    const full = await applyPatch(Buffer.from(input), patch);
    expect(bytesEqual(output, new Uint8Array(full))).toBe(true);
  });

  it("returns empty overlay list for native move", async () => {
    const input = loadFixture("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 3);
    expect(block).toBeDefined();

    const newBbox = {
      ...block!.bbox,
      px: block!.bbox.px + 40,
      py: block!.bbox.py + 10,
    };

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: newBbox,
          baselineY: (block!.baselineY ?? block!.bbox.py) + 10,
          font: block!.font,
          locator: block!.locator,
          originalBbox: block!.bbox,
          modified: true,
        },
      ],
    };

    const { output, overlayBlocks } = await applyNativePatch(input, patch, nodeAdapters);
    expect(overlayBlocks).toHaveLength(0);

    const doc2 = await CosDocument.open(output, { inflate: nodeAdapters.inflate });
    const locator = decodeLocator(block!.locator!)!;
    const { spans } = await doc2.pageSpans(doc2.pages()[block!.page - 1]!);
    const moved = spans.find(
      (s) =>
        (s.text ?? "") === block!.text &&
        Math.abs(s.origin.x - newBbox.px) < 3
    );
    expect(moved).toBeDefined();
  });

  it("routes style change to overlayBlocks", async () => {
    const input = loadFixture("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator);
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: block!.bbox,
          font: { ...block!.font, size: block!.font.size + 4 },
          locator: block!.locator,
          overlay: true,
          modified: true,
        },
      ],
    };

    expect(isOverlayBlock(patch.blocks[0]!)).toBe(true);

    const { overlayBlocks } = await applyNativePatch(input, patch, nodeAdapters);
    expect(overlayBlocks.length).toBeGreaterThan(0);
    expect(overlayBlocks[0]!.id).toBe(block!.id);
  });

  it("native + overlay pipeline matches full applyPatch", async () => {
    const input = loadFixture("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator);
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: block!.bbox,
          font: { ...block!.font, color: "#ff0000" },
          locator: block!.locator,
          overlay: true,
          modified: true,
        },
      ],
    };

    const { output, overlayBlocks } = await applyNativePatch(input, patch, nodeAdapters);
    expect(overlayBlocks.length).toBeGreaterThan(0);

    const piped = await applyOverlayWithNativeStrip(
      output,
      overlayBlocks,
      nodeOverlayPlatform,
      nodeAdapters
    );
    const full = await applyPatch(Buffer.from(input), patch);
    expect(piped.length).toBeGreaterThan(100);
    expect(full.length).toBeGreaterThan(100);
    const docPiped = await CosDocument.open(piped, { inflate: nodeAdapters.inflate });
    const docFull = await CosDocument.open(new Uint8Array(full), { inflate: nodeAdapters.inflate });
    expect(docPiped.pages().length).toBe(docFull.pages().length);
  });
});
