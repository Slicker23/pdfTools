import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadCorpus, loadCorpusFile } from "./util";

const TOL = 1.0;

// Rotation-agnostic size compare: pdfium may report swapped dims for rotated
// pages, so compare the unordered {w,h} pair.
function sizePair(w: number, h: number): [number, number] {
  return w <= h ? [w, h] : [h, w];
}

describe("oracle over corpus (pdfium)", () => {
  const corpus = loadCorpus();

  for (const entry of corpus) {
    it(`${entry.file}: page count + sizes`, async () => {
      const bytes = loadCorpusFile(entry.file);
      const doc = await CosDocument.open(bytes, {
        inflate: nodeAdapters.inflate,
        password: entry.password ?? "",
      });
      const ours = doc.pages();
      expect(ours.length).toBe(entry.pages);

      // pdfium opens empty-user-password files; skip its cross-check when a
      // non-empty password is required (still assert count above).
      if (entry.password) return;

      const oracle = await loadDocument(Buffer.from(bytes));
      try {
        expect(ours.length).toBe(oracle.pageCount);
        for (let i = 0; i < oracle.pageCount; i++) {
          const page = await oracle.getPage(i);
          try {
            const [a, b] = sizePair(ours[i]!.width, ours[i]!.height);
            const [c, d] = sizePair(page.width, page.height);
            expect(Math.abs(a - c)).toBeLessThanOrEqual(TOL);
            expect(Math.abs(b - d)).toBeLessThanOrEqual(TOL);
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
