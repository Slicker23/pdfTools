import { describe, expect, it } from "vitest";
import { EDIT_MODEL_VERSION, type PdfEditDocument } from "@/lib/pdf/edit-model";
import {
  applyIntentToState,
  blockIsChanged,
  exportPatchFromDocument,
  snapshotFromBlock,
} from "../../src/lib/pdf-engine/edit-session-core";

function sampleDoc(): PdfEditDocument {
  return {
    version: EDIT_MODEL_VERSION,
    documentId: "test-doc",
    pages: [
      {
        number: 1,
        width: 595,
        height: 842,
        blocks: [
          {
            id: "b1",
            page: 1,
            text: "Hello",
            lineCount: 1,
            bbox: { px: 50, py: 700, pw: 40, ph: 12 },
            font: {
              name: "Helvetica",
              size: 12,
              bold: false,
              italic: false,
              color: "#111111",
            },
            locator: "p1:s4:o10",
            modified: false,
          },
        ],
      },
    ],
  };
}

describe("edit-session-core", () => {
  it("tracks text edits and exports patch", () => {
    const doc = sampleDoc();
    const originals = new Map([["b1", snapshotFromBlock(doc.pages[0]!.blocks[0]!)]]);
    const next = applyIntentToState(doc, originals, { kind: "updateText", id: "b1", text: "Hi" });
    const block = next.pages[0]!.blocks[0]!;
    expect(block.text).toBe("Hi");
    expect(blockIsChanged("b1", block, originals)).toBe(true);
    const patch = exportPatchFromDocument(next, originals);
    expect(patch?.blocks).toHaveLength(1);
    expect(patch?.blocks[0]?.text).toBe("Hi");
  });

  it("marks cleared text as deleted in patch export", () => {
    const doc = sampleDoc();
    const originals = new Map([["b1", snapshotFromBlock(doc.pages[0]!.blocks[0]!)]]);
    const next = applyIntentToState(doc, originals, { kind: "updateText", id: "b1", text: "   " });
    const patch = exportPatchFromDocument(next, originals);
    expect(patch?.blocks[0]?.deleted).toBe(true);
  });

  it("exports user-created text blocks for preview insert", () => {
    const doc = sampleDoc();
    const originals = new Map([["b1", snapshotFromBlock(doc.pages[0]!.blocks[0]!)]]);
    const created = {
      id: "new:p1:abc",
      page: 1,
      text: "New text",
      created: true,
      modified: true,
      insertAt: { px: 100, py: 200 },
      bbox: { px: 100, py: 180, pw: 80, ph: 14 },
      baselineY: 200,
      lineCount: 1,
      font: {
        name: "Helvetica",
        size: 12,
        bold: false,
        italic: false,
        color: "#111111",
      },
    };
    const next = applyIntentToState(doc, originals, { kind: "addBlock", block: created });
    const block = next.pages[0]!.blocks.find((b) => b.id === created.id)!;
    expect(blockIsChanged(created.id, block, originals)).toBe(true);
    const patch = exportPatchFromDocument(next, originals);
    expect(patch?.blocks.some((b) => b.id === created.id && b.created)).toBe(true);
  });

  it("exports color-only style edits", () => {
    const doc = sampleDoc();
    const originals = new Map([["b1", snapshotFromBlock(doc.pages[0]!.blocks[0]!)]]);
    const next = applyIntentToState(doc, originals, {
      kind: "updateStyle",
      id: "b1",
      patch: { color: "#ff0000" },
    });
    const block = next.pages[0]!.blocks[0]!;
    expect(block.font.color).toBe("#ff0000");
    expect(blockIsChanged("b1", block, originals)).toBe(true);
    const patch = exportPatchFromDocument(next, originals);
    expect(patch?.blocks[0]?.font?.color).toBe("#ff0000");
    expect(patch?.blocks[0]?.overlay).toBe(true);
    expect(patch?.blocks[0]?.originalFont?.color).toBe("#111111");
  });
});
