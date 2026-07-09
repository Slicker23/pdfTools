import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

async function firstSpan(fixture: string) {
  const doc = await open(loadFixture(fixture));
  const { spans } = await doc.pageSpans(doc.pages()[0]!);
  return spans[0]!;
}

describe("interpreter advances (base-14 widths)", () => {
  it("font-widths: per-glyph advance, positions, and right edge", async () => {
    const s = await firstSpan("font-widths.pdf");
    // Helvetica A=667, V=667 at 100pt -> advance 66.7 each.
    expect(s.glyphs).toBeDefined();
    expect(s.glyphs!.length).toBe(2);
    expect(s.glyphs![0]!.x).toBeCloseTo(50, 4);
    expect(s.glyphs![0]!.width).toBeCloseTo(66.7, 4);
    expect(s.glyphs![1]!.x).toBeCloseTo(116.7, 4);
    expect(s.glyphs![1]!.width).toBeCloseTo(66.7, 4);
    expect(s.endOrigin!.x).toBeCloseTo(183.4, 4);
    expect(s.rightEdge!).toBeCloseTo(183.4, 4);
    expect(s.origin.y).toBeCloseTo(700, 4);
  });

  it("font-embedded-widths: explicit /Widths drive the advance", async () => {
    const s = await firstSpan("font-embedded-widths.pdf");
    // A width 1000 at 100pt -> advance 100.
    expect(s.glyphs![0]!.width).toBeCloseTo(100, 4);
    expect(s.rightEdge!).toBeCloseTo(150, 4);
  });

  it("font-tj-kern: TJ adjustment reduces the cumulative advance", async () => {
    const s = await firstSpan("font-tj-kern.pdf");
    // 66.7 (A) - 12 (TJ +120) + 66.7 (V) = 121.4 total.
    expect(s.rightEdge!).toBeCloseTo(50 + 121.4, 3);
    expect(s.endOrigin!.x).toBeCloseTo(171.4, 3);
  });

  it("font-type0-identity: 2-byte decode with /W advances", async () => {
    const s = await firstSpan("font-type0-identity.pdf");
    expect(s.glyphs!.length).toBe(2);
    expect(s.glyphs![0]!.x).toBeCloseTo(50, 4);
    expect(s.glyphs![0]!.width).toBeCloseTo(50, 4); // CID1 width 500 @100pt
    expect(s.glyphs![1]!.x).toBeCloseTo(100, 4);
    expect(s.glyphs![1]!.width).toBeCloseTo(60, 4); // CID2 width 600 @100pt
    expect(s.rightEdge!).toBeCloseTo(160, 4);
  });

  it("produces an axis-aligned bbox around the text", async () => {
    const s = await firstSpan("font-widths.pdf");
    expect(s.bbox).toBeDefined();
    const [x0, y0, x1, y1] = s.bbox!;
    expect(x0).toBeCloseTo(50, 1);
    expect(x1).toBeCloseTo(183.4, 0);
    // Helvetica ascent 718 / descent -207 at 100pt.
    expect(y1).toBeGreaterThan(760);
    expect(y0).toBeLessThan(700);
    expect(y1 - y0).toBeGreaterThan(80);
  });
});
