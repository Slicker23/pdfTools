import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadCorpus, loadCorpusFile } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

/** Margin (points) for MediaBox containment and pdfium bbox containment. */
const MEDIA_MARGIN = 3;
const BBOX_MARGIN = 6;

describe("interpreter: corpus robustness + pdfium containment", () => {
  const entries = loadCorpus().filter((e) => !e.encrypted);

  for (const entry of entries) {
    it(`interprets every page of ${entry.file} within bounds`, async () => {
      const bytes = loadCorpusFile(entry.file);
      const doc = await open(bytes);
      const pages = doc.pages();

      const oracle = await loadDocument(Buffer.from(bytes));
      try {
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]!;
          const { spans } = await doc.pageSpans(page);
          const [x0, y0, x1, y1] = page.mediaBox;
          const minX = Math.min(x0, x1) - MEDIA_MARGIN;
          const maxX = Math.max(x0, x1) + MEDIA_MARGIN;
          const minY = Math.min(y0, y1) - MEDIA_MARGIN;
          const maxY = Math.max(y0, y1) + MEDIA_MARGIN;

          // Every span origin lies within (a slightly padded) MediaBox.
          for (const s of spans) {
            expect(s.origin.x).toBeGreaterThanOrEqual(minX);
            expect(s.origin.x).toBeLessThanOrEqual(maxX);
            expect(s.origin.y).toBeGreaterThanOrEqual(minY);
            expect(s.origin.y).toBeLessThanOrEqual(maxY);
          }

          // Compare against pdfium's text objects on the same page.
          const oraclePage = await oracle.getPage(i);
          try {
            let left = Infinity;
            let bottom = Infinity;
            let right = -Infinity;
            let top = -Infinity;
            let textCount = 0;
            for await (const o of oraclePage.objects()) {
              if (o.type !== "text") continue;
              textCount++;
              left = Math.min(left, o.bounds.left);
              bottom = Math.min(bottom, o.bounds.bottom);
              right = Math.max(right, o.bounds.right);
              top = Math.max(top, o.bounds.top);
            }

            // Text-bearing pages (per pdfium) must yield at least one span.
            if (textCount > 0) {
              expect(spans.length).toBeGreaterThan(0);
              // Origins fall inside pdfium's union text bbox (small tolerance).
              for (const s of spans) {
                expect(s.origin.x).toBeGreaterThanOrEqual(left - BBOX_MARGIN);
                expect(s.origin.x).toBeLessThanOrEqual(right + BBOX_MARGIN);
                expect(s.origin.y).toBeGreaterThanOrEqual(bottom - BBOX_MARGIN);
                expect(s.origin.y).toBeLessThanOrEqual(top + BBOX_MARGIN);
              }
            }
          } finally {
            oraclePage.close();
          }
        }
      } finally {
        oracle.destroy();
      }
    });
  }
});
