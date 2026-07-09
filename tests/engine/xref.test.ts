import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

async function open(name: string) {
  return CosDocument.open(loadFixture(name), { inflate: nodeAdapters.inflate });
}

describe("xref + page tree", () => {
  it("parses a classic xref table (cv-like.pdf)", async () => {
    const doc = await open("cv-like.pdf");
    expect(doc.encrypted).toBe(false);
    const pages = doc.pages();
    expect(pages.length).toBe(1);
    expect(Math.round(pages[0]!.width)).toBe(595);
    expect(Math.round(pages[0]!.height)).toBe(842);
    // Trailer resolves to a catalog.
    expect(doc.catalog.type).toBe("dict");
  });

  it("parses xref streams + object streams (1.pdf)", async () => {
    const doc = await open("1.pdf");
    const pages = doc.pages();
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const p of pages) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }

    // The fixture uses object streams, so at least one object must be compressed.
    const compressed = doc
      .objectNumbers()
      .some((n) => doc.xrefEntry(n)?.kind === "compressed");
    expect(compressed).toBe(true);

    // And a compressed object must resolve to a real value.
    const firstCompressed = doc
      .objectNumbers()
      .find((n) => doc.xrefEntry(n)?.kind === "compressed")!;
    expect(doc.getObject(firstCompressed).type).not.toBe("null");
  });
});
