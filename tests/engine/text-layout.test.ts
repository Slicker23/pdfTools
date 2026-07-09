import { describe, expect, it } from "vitest";
import {
  layoutBlockForPage,
  layoutBlockWithinPage,
  layoutTextLines,
  maxTextWidthForBlock,
  wrapParagraph,
} from "../../src/lib/pdf/text-layout";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";

const baseBlock = (overrides: Partial<PdfEditTextBlock> = {}): PdfEditTextBlock => ({
  id: "b1",
  page: 1,
  text: "Hello",
  bbox: { px: 72, py: 700, pw: 200, ph: 14 },
  font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111" },
  lineCount: 1,
  ...overrides,
});

describe("text-layout", () => {
  it("limits wrap width to the page right margin", () => {
    expect(maxTextWidthForBlock(500, 300, 595)).toBe(83);
  });

  it("wraps long words onto the next line", () => {
    const font = baseBlock().font;
    const measure = (t: string) => t.length * font.size * 0.55;
    const lines = wrapParagraph(
      "Supercalifragilisticexpialidocious continuation",
      120,
      measure
    );
    expect(lines.length).toBeGreaterThan(1);
  });

  it("wraps paragraphs within a column width", () => {
    const lines = layoutTextLines(
      "one two three four five six seven eight nine ten",
      baseBlock().font,
      595,
      72,
      180
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("one");
  });

  it("respects explicit newlines as paragraph breaks", () => {
    const lines = layoutTextLines("Line A\nLine B", baseBlock().font, 595, 72, 400);
    expect(lines).toEqual(["Line A", "Line B"]);
  });

  it("updates bbox height when text wraps", () => {
    const block = baseBlock({
      text: "word ".repeat(40).trim(),
      bbox: { px: 72, py: 700, pw: 150, ph: 14 },
    });
    const laid = layoutBlockForPage(block, 595);
    expect(laid.lineCount).toBeGreaterThan(1);
    expect(laid.bbox.ph).toBeGreaterThan(block.font.size * 1.2);
    expect(laid.text).toContain("\n");
  });

  it("keeps wrapped text inside page bounds", () => {
    const block = baseBlock({
      text: "word ".repeat(80).trim(),
      bbox: { px: 72, py: 20, pw: 150, ph: 14 },
      baselineY: 40,
    });
    const next = layoutBlockWithinPage(block, 595, 842);
    expect(next.bbox.py).toBeGreaterThanOrEqual(0);
    expect(next.bbox.py + next.bbox.ph).toBeLessThanOrEqual(842 + 0.01);
  });
});
