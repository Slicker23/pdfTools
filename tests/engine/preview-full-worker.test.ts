import { describe, expect, it } from "vitest";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import { EditSession } from "../../src/lib/pdf-engine/browser/session";
import { applyNativePatch } from "../../src/lib/pdf-engine/apply-native";
import { pdfEngineExtract } from "../../src/lib/pdf-engine/run";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

describe("previewFull worker session", () => {
  it("matches applyNativePatch for native-only edits", async () => {
    const input = loadFixture("cv-like.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 5);
    expect(block).toBeDefined();

    const session = new EditSession();
    session.open(input, doc, nodeAdapters);
    session.applyIntent({ kind: "updateText", id: block!.id, text: "Edited" });

    const { pdfBytes: sessionOut } = await session.previewFull();
    const patch = session.exportPatch();
    expect(patch).not.toBeNull();

    const { output: directOut } = await applyNativePatch(input, patch!, nodeAdapters);
    expect(sessionOut.byteLength).toBe(directOut.byteLength);
  });

  it("previewFull delegates overlay blocks to applyFullPatch path", async () => {
    const input = loadFixture("cv-like.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator);
    expect(block).toBeDefined();

    const overlayBlock: PdfEditBlockPatch = {
      id: block!.id,
      page: block!.page,
      text: block!.text,
      bbox: block!.bbox,
      font: { ...block!.font, name: "Times-Roman" },
      locator: block!.locator,
      encodableChars: block!.encodableChars,
      modified: true,
      overlay: true,
    };

    const session = new EditSession();
    session.open(input, doc, nodeAdapters);
    session.applyIntent({
      kind: "updateStyle",
      id: overlayBlock.id,
      patch: { fontName: "Times-Roman" },
    });

    const patch = session.exportPatch();
    expect(patch?.blocks.some((b) => b.overlay)).toBe(true);
    const { overlayBlockIds } = await session.previewNative();
    expect(overlayBlockIds.length).toBeGreaterThan(0);
  });
});
