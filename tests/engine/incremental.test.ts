import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

/**
 * incremental.pdf redefines object 3 (the page) in an appended section whose
 * trailer /Prev points back at the original xref. A correct reader must:
 *   - follow the /Prev chain and see all four objects, and
 *   - honour newest-wins: the page MediaBox is the UPDATED [0 0 400 500],
 *     not the original [0 0 300 300].
 */
describe("incremental update (/Prev chain + newest-wins)", () => {
  it("resolves the newest object definition", async () => {
    const bytes = loadFixture("incremental.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const pages = doc.pages();

    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(400, 5);
    expect(pages[0]!.height).toBeCloseTo(500, 5);
  });

  it("agrees with pdfium-native", async () => {
    const bytes = loadFixture("incremental.pdf");
    const ours = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const ourPages = ours.pages();

    const oracle = await loadDocument(Buffer.from(bytes));
    try {
      expect(ourPages.length).toBe(oracle.pageCount);
      const page = await oracle.getPage(0);
      try {
        expect(Math.abs(ourPages[0]!.width - page.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(ourPages[0]!.height - page.height)).toBeLessThanOrEqual(1);
      } finally {
        page.close();
      }
    } finally {
      oracle.destroy();
    }
  });
});
