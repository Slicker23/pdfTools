import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const FIXTURES = ["1.pdf", "cv-like.pdf"];
const TOL = 1.0;

describe("oracle: match pdfium-native", () => {
  for (const name of FIXTURES) {
    it(`page count and sizes agree for ${name}`, async () => {
      const bytes = loadFixture(name);

      const ours = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
      const ourPages = ours.pages();

      const oracle = await loadDocument(Buffer.from(bytes));
      try {
        expect(ourPages.length).toBe(oracle.pageCount);
        for (let i = 0; i < oracle.pageCount; i++) {
          const page = await oracle.getPage(i);
          try {
            expect(Math.abs(ourPages[i]!.width - page.width)).toBeLessThanOrEqual(TOL);
            expect(Math.abs(ourPages[i]!.height - page.height)).toBeLessThanOrEqual(TOL);
          } finally {
            page.close();
          }
        }
      } finally {
        oracle.destroy();
      }
    });
  }
});
