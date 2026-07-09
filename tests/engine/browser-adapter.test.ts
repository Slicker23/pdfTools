import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { browserAdapters } from "../../src/lib/pdf-engine/browser/platform-browser";
import { loadFixture } from "./util";

// DecompressionStream is a global in Node 18+ and browsers, so the same browser
// adapter code path is exercised here to prove the core is isomorphic.

const FIXTURES = ["1.pdf", "cv-like.pdf", "enc/rc4-128.pdf", "enc/aes-128.pdf", "enc/aes-256.pdf"];

describe("browser DecompressionStream adapter", () => {
  it("has DecompressionStream available", () => {
    expect(typeof DecompressionStream).toBe("function");
  });

  for (const name of FIXTURES) {
    it(`opens ${name} identically to the node adapter`, async () => {
      const bytes = loadFixture(name);

      const viaNode = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
      const viaBrowser = await CosDocument.open(bytes, { inflate: browserAdapters.inflate });

      const nodePages = viaNode.pages();
      const browserPages = viaBrowser.pages();

      expect(browserPages.length).toBe(nodePages.length);
      for (let i = 0; i < nodePages.length; i++) {
        expect(browserPages[i]!.width).toBeCloseTo(nodePages[i]!.width, 3);
        expect(browserPages[i]!.height).toBeCloseTo(nodePages[i]!.height, 3);
      }
    });
  }

  it("resolves compressed (object-stream) objects via async inflate (1.pdf)", async () => {
    const bytes = loadFixture("1.pdf");
    const doc = await CosDocument.open(bytes, { inflate: browserAdapters.inflate });
    const firstCompressed = doc
      .objectNumbers()
      .find((n) => doc.xrefEntry(n)?.kind === "compressed")!;
    expect(doc.getObject(firstCompressed).type).not.toBe("null");
  });

  it("decodes a content stream via async inflate (cv-like.pdf)", async () => {
    const bytes = loadFixture("cv-like.pdf");
    const doc = await CosDocument.open(bytes, { inflate: browserAdapters.inflate });
    const contents = doc.get(doc.pages()[0]!.dict, "Contents");
    const decoded = await doc.decodeStream(contents);
    expect(Buffer.from(decoded).toString("latin1")).toContain("John Developer");
  });
});
