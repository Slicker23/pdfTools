import { describe, expect, it } from "vitest";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import { translateBlockPosition } from "@/lib/pdf/edit-geometry";
import {
  applyOverlayWithNativeStrip,
  segmentLayoutMatches,
} from "../../src/lib/pdf-engine/apply-overlay";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

describe("segment overlay layout", () => {
  it("segmentLayoutMatches ignores injected word spaces", () => {
    const block: PdfEditBlockPatch = {
      id: "b1",
      page: 1,
      text: "Autistacamion Arcese Transporti",
      bbox: { px: 10, py: 20, pw: 200, ph: 12 },
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111" },
      segments: "AutistacamionArceseTransporti".split("").map((ch, i) => ({
        locator: `p1:s1:o${i}`,
        text: ch,
        bbox: { px: 10 + i * 5.7, py: 20, pw: 5.5, ph: 12 },
      })),
    };
    expect(segmentLayoutMatches(block)).toBe(true);
    block.text = "Edited text";
    expect(segmentLayoutMatches(block)).toBe(false);
  });

  it("translateBlockPosition moves segment bboxes with the block", () => {
    const block = {
      id: "b1",
      page: 1,
      text: "Arc",
      bbox: { px: 10, py: 20, pw: 150, ph: 12 },
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111" },
      segments: [
        { locator: "p1:s1:o1", text: "A", bbox: { px: 10, py: 20, pw: 6, ph: 12 } },
        { locator: "p1:s1:o2", text: "r", bbox: { px: 80, py: 20, pw: 6, ph: 12 } },
        { locator: "p1:s1:o3", text: "c", bbox: { px: 150, py: 20, pw: 6, ph: 12 } },
      ],
    };
    const moved = translateBlockPosition(block, 50, -10);
    expect(moved.bbox.px).toBe(60);
    expect(moved.segments?.[1]?.bbox.px).toBe(130);
    expect(moved.segments?.[2]?.bbox.py).toBe(10);
  });

  it("overlay redraw preserves wide gaps between segment glyphs after move", async () => {
    const input = loadFixture("cv-like.pdf");
    const platform = {
      sampleBgRgb: async () => ({ r: 1, g: 1, b: 1 }),
      loadUnicodeFont: async (pdfDoc: import("pdf-lib").PDFDocument) => {
        const { StandardFonts } = await import("pdf-lib");
        return pdfDoc.embedFont(StandardFonts.Helvetica);
      },
    };

    const block: PdfEditBlockPatch = {
      id: "seg-move",
      page: 1,
      text: "A  B",
      modified: true,
      overlay: true,
      bbox: { px: 110, py: 690, pw: 80, ph: 14 },
      originalBbox: { px: 10, py: 690, pw: 80, ph: 14 },
      baselineY: 700,
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
      segments: [
        { locator: "p1:s4:o100", text: "A", bbox: { px: 110, py: 690, pw: 8, ph: 14 } },
        { locator: "p1:s4:o200", text: "B", bbox: { px: 170, py: 690, pw: 8, ph: 14 } },
      ],
    };

    const out = await applyOverlayWithNativeStrip(input, [block], platform, nodeAdapters);
    expect(out.length).toBeGreaterThan(input.length);
  });
});
