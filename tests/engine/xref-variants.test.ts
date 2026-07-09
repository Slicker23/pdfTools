import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

async function oracleFirstPageSize(bytes: Uint8Array): Promise<{
  count: number;
  width: number;
  height: number;
}> {
  const oracle = await loadDocument(Buffer.from(bytes));
  try {
    const page = await oracle.getPage(0);
    try {
      return { count: oracle.pageCount, width: page.width, height: page.height };
    } finally {
      page.close();
    }
  } finally {
    oracle.destroy();
  }
}

// NOTE on the oracle: the /XRefStm entries in a hybrid-reference file must
// override the classic table's free placeholders for the same objects. The
// bundled pdfium build does NOT merge /XRefStm (it treats the placeholder as
// authoritative and fails to load the page), so pdfium cannot serve as the
// oracle here. We instead assert against the authored geometry; a spec-compliant
// reader must reach obj 3 via /XRefStm and report [0 0 250 350].
describe("hybrid reference (/XRefStm): classic table + xref stream", () => {
  it("/XRefStm entries override classic free placeholders", async () => {
    const bytes = loadFixture("hybrid.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const pages = doc.pages();

    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(250, 5);
    expect(pages[0]!.height).toBeCloseTo(350, 5);
  });
});

describe("cross-type /Prev: xref-stream base + classic increment", () => {
  it("honours newest-wins across xref representations", async () => {
    const bytes = loadFixture("prev-crosstype.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const pages = doc.pages();

    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(420, 5);
    expect(pages[0]!.height).toBeCloseTo(600, 5);
  });

  it("agrees with pdfium-native", async () => {
    const bytes = loadFixture("prev-crosstype.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const pages = doc.pages();
    const oracle = await oracleFirstPageSize(bytes);

    expect(pages.length).toBe(oracle.count);
    expect(Math.abs(pages[0]!.width - oracle.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(pages[0]!.height - oracle.height)).toBeLessThanOrEqual(1);
  });
});
