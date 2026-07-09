import { describe, expect, it } from "vitest";
import { CosDocument, getBlockOutlinePaths } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

describe("getBlockOutlinePaths", () => {
  it("returns glyph paths for embedded TrueType fixture", async () => {
    const bytes = loadFixture("font-outline-ttf.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const page = doc.pages()[0]!;
    const { spans } = await doc.pageSpans(page);
    const span = spans.find((s) => s.text === "Hi" && s.source);
    expect(span?.source).toBeDefined();

    const result = await getBlockOutlinePaths(doc, {
      page: 1,
      streamNum: span!.source!.streamNum,
      regionStart: span!.source!.regionStart,
    });

    expect(result).toBeDefined();
    expect(result!.glyphs.length).toBeGreaterThan(0);
    expect(result!.glyphs.every((g) => g.some((s) => s.op !== "Z"))).toBe(true);
  });
});
