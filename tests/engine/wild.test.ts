import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { listWildFiles, loadWildFile } from "./util";

// Drop any real-world PDF into tests/fixtures/wild/ and it is automatically
// checked here against pdfium (page count + rotation-agnostic MediaBox). No
// per-file code needed. Empty directory -> suite is skipped.

const TOL = 1.0;
const files = listWildFiles();

function sizePair(w: number, h: number): [number, number] {
  return w <= h ? [w, h] : [h, w];
}

describe.skipIf(files.length === 0)("wild corpus (real-world PDFs)", () => {
  for (const file of files) {
    it(`${file}: matches pdfium`, async () => {
      const bytes = loadWildFile(file);
      const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
      const ours = doc.pages();

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
