import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import {
  CosDocument,
  decodeLocator,
  encodeLocator,
  flattenTextRuns,
  spanOutlineBBox,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

describe("flattenTextRuns", () => {
  it("flattens embedded TrueType text to paths", async () => {
    const bytes = loadFixture("font-outline-ttf.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const page = doc.pages()[0]!;
    const { spans } = await doc.pageSpans(page);
    const span = spans.find((s) => s.text === "Hi" && s.source);
    expect(span?.source).toBeDefined();

    const locator = {
      page: 1,
      streamNum: span!.source!.streamNum,
      regionStart: span!.source!.regionStart,
    };

    const outlineFont = await doc.buildOutlineFontForDict(span!.fontDict as never);
    const bboxBefore = spanOutlineBBox(span!, outlineFont);
    expect(bboxBefore).toBeDefined();

    const result = await flattenTextRuns(doc, [{ locator }], nodeAdapters.deflate);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const oracle = await loadDocument(Buffer.from(result.output));
    try {
      expect(oracle.pageCount).toBe(1);
      const pg = await oracle.getPage(0);
      try {
        // Text object may be gone or empty after flatten; page still opens.
        expect(pg.width).toBeGreaterThan(0);
      } finally {
        pg.close();
      }
    } finally {
      oracle.destroy();
    }

    const doc2 = await CosDocument.open(result.output, { inflate: nodeAdapters.inflate });
    const { spans: spans2 } = await doc2.pageSpans(doc2.pages()[0]!);
    const hiSpan = spans2.find((s) => s.text === "Hi");
    expect(hiSpan?.text ?? "").not.toBe("Hi");
  });

  it("encodeLocator round-trips flatten locators", () => {
    const loc = { page: 1, streamNum: 4, regionStart: 42 };
    expect(decodeLocator(encodeLocator(loc))).toEqual(loc);
  });
});
