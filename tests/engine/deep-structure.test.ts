import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { isStream } from "../../src/lib/pdf-engine/core/cos/types";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const open = (name: string) =>
  CosDocument.open(loadFixture(name), { inflate: nodeAdapters.inflate });

describe("structural robustness", () => {
  // Regression: a deeply nested (but legal) page tree once overflowed the JS
  // call stack during recursive traversal; the overflow was swallowed by
  // getObject's catch-all, silently truncating the tree to zero pages. The walk
  // is now iterative and must resolve the single leaf regardless of depth.
  it("resolves a ~40k-deep page tree without truncation", async () => {
    const doc = await open("deep-pages.pdf");
    const pages = doc.pages();
    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(200, 5);
    expect(pages[0]!.height).toBeCloseTo(200, 5);
  });

  it("terminates on a cyclic page tree and still finds the leaf", async () => {
    const doc = await open("cycle-pages.pdf");
    const pages = doc.pages();
    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(320, 5);
    expect(pages[0]!.height).toBeCloseTo(240, 5);
  });

  it("resolves a stream whose /Length is an indirect reference", async () => {
    const doc = await open("indirect-length.pdf");
    const page = doc.pages()[0]!;
    const stream = doc.get(page.dict, "Contents");
    expect(isStream(stream)).toBe(true);
    if (isStream(stream)) {
      const bytes = await doc.decodeStream(stream);
      expect(Buffer.from(bytes).toString("latin1")).toBe("BT /F1 12 Tf (hi) Tj ET\n");
    }
  });

  it("parses an xref stream with a zero-width type field (W[0 2 1])", async () => {
    const doc = await open("xref-w0.pdf");
    const pages = doc.pages();
    expect(pages.length).toBe(1);
    expect(pages[0]!.width).toBeCloseTo(400, 5);
    expect(pages[0]!.height).toBeCloseTo(300, 5);
  });
});
