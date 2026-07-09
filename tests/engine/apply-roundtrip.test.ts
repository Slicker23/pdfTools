import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { pdfEngineExtract, pdfEngineApply } from "../../src/lib/pdf-engine/run";
import type { PdfEditPatch, PdfEditTextBlock } from "../../src/lib/pdf/edit-model";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Buffer {
  return readFileSync(path.join(FIXTURES, name));
}

/** First block whose text is simple, editable Latin and >= 3 chars. */
function pickBlock(doc: Awaited<ReturnType<typeof pdfEngineExtract>>): PdfEditTextBlock | undefined {
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.locator && b.text.length >= 3 && /^[\x20-\x7e]+$/.test(b.text)) return b;
    }
  }
  return undefined;
}

describe("native extract -> apply round-trip", () => {
  it("edits a run in place and re-extracts the new text", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(input);
    const block = pickBlock(doc);
    expect(block).toBeDefined();

    const orig = block!.text;
    const newText = orig[1]! + orig[0]! + orig.slice(2); // swap first two chars

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: newText,
          bbox: block!.bbox,
          font: block!.font,
          locator: block!.locator,
          modified: true,
        },
      ],
    };

    const output = await pdfEngineApply(input, patch);
    expect(output.length).toBeGreaterThan(0);

    // Incremental update preserves the original bytes as a prefix.
    expect(output.subarray(0, input.length).equals(input)).toBe(true);

    // Re-extract and confirm the edited run now reads the new text.
    const doc2 = await pdfEngineExtract(output);
    const edited = doc2.pages
      .flatMap((p) => p.blocks)
      .find((b) => b.locator === block!.locator);
    expect(edited).toBeDefined();
    expect(edited!.text).toContain(newText.slice(0, Math.min(6, newText.length)));
  });

  it("produces a valid PDF that pdfium can open with the same page count", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(input);
    const block = pickBlock(doc)!;
    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block.id,
          page: block.page,
          text: block.text[1]! + block.text[0]! + block.text.slice(2),
          bbox: block.bbox,
          font: block.font,
          locator: block.locator,
          modified: true,
        },
      ],
    };
    const output = await pdfEngineApply(input, patch);

    const { loadDocument } = await import("pdfium-native");
    const before = await loadDocument(input);
    const beforeCount = before.pageCount;
    before.destroy();
    const after = await loadDocument(Buffer.from(output));
    expect(after.pageCount).toBe(beforeCount);
    after.destroy();
  });

  it("flattens embedded TrueType text via apply patch", async () => {
    const input = load("font-outline-ttf.pdf");
    const doc = await pdfEngineExtract(input);
    const block = doc.pages[0]?.blocks.find((b) => b.locator && b.text === "Hi");
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: block!.bbox,
          font: block!.font,
          locator: block!.locator,
          flattenToPath: true,
          modified: true,
        },
      ],
    };

    const output = await pdfEngineApply(input, patch);
    const { loadDocument } = await import("pdfium-native");
    const after = await loadDocument(Buffer.from(output));
    expect(after.pageCount).toBe(1);
    after.destroy();

    const doc2 = await pdfEngineExtract(output);
    const hi = doc2.pages[0]?.blocks.find((b) => b.text === "Hi");
    expect(hi).toBeUndefined();
  });
});
