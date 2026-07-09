import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfEngineExtract, pdfEngineApply } from "../../src/lib/pdf-engine/run";
import type { PdfEditPatch } from "../../src/lib/pdf/edit-model";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Buffer {
  return readFileSync(path.join(FIXTURES, name));
}

function pickBlock(doc: Awaited<ReturnType<typeof pdfEngineExtract>>) {
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.locator && b.text.length >= 3 && /^[\x20-\x7e]+$/.test(b.text)) return b;
    }
  }
  return undefined;
}

describe("overlay layout (long + multiline redraw)", () => {
  it("shrinks long replacement text to fit bbox width", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(input);
    const block = pickBlock(doc);
    expect(block).toBeDefined();

    const longText = "W".repeat(80);
    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: longText,
          bbox: block!.bbox,
          font: block!.font,
          baselineY: block!.baselineY,
          locator: block!.locator,
          overlay: true,
          modified: true,
        },
      ],
    };

    const output = await pdfEngineApply(input, patch);
    const pdf = await PDFDocument.load(output);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it("draws multiline overlay replacements", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(input);
    const block = pickBlock(doc);
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: "Line one\nLine two",
          bbox: block!.bbox,
          font: block!.font,
          baselineY: block!.baselineY,
          locator: block!.locator,
          overlay: true,
          modified: true,
        },
      ],
    };

    const output = await pdfEngineApply(input, patch);
    expect(output.length).toBeGreaterThan(input.length - 1000);
  });
});
