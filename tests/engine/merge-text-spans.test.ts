import { describe, expect, it } from "vitest";
import type { TextSpan } from "../../src/lib/pdf-engine/core";
import { cosDict, cosName } from "../../src/lib/pdf-engine/core/cos/types";
import {
  groupMergeableSpans,
  mergedSpanText,
  spansMergeable,
} from "../../src/lib/pdf-engine/merge-text-spans";

function helveticaDict(): TextSpan["fontDict"] {
  const d = cosDict(new Map([["BaseFont", cosName("Helvetica")]]));
  return d;
}

function span(
  text: string,
  x: number,
  y: number,
  w: number,
  streamOffset: number,
  fontRef = "F1"
): TextSpan {
  const right = x + w;
  return {
    origin: { x, y },
    matrix: [12, 0, 0, 12, x, y],
    fontRef,
    fontDict: helveticaDict(),
    fontSize: 12,
    renderMode: 0,
    fillColor: { r: 0, g: 0, b: 0, a: 1 },
    codes: new Uint8Array(),
    items: [],
    text,
    rightEdge: right,
    bbox: [x, y - 2, right, y + 10],
    source: { streamNum: 4, regionStart: streamOffset, regionEnd: streamOffset + 10, op: "Tj" },
  };
}

describe("merge-text-spans", () => {
  it("merges capital T + rest of word on same baseline", () => {
    const t = span("T", 100, 200, 8, 100);
    const rest = span("ransport", 107.5, 200, 52, 200);
    expect(spansMergeable(t, rest)).toBe(true);
    const groups = groupMergeableSpans([t, rest]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    expect(mergedSpanText(groups[0]!)).toBe("Transport");
  });

  it("does not merge across word gaps", () => {
    const a = span("Hello", 50, 200, 30, 50);
    const b = span("World", 120, 200, 35, 120);
    expect(spansMergeable(a, b)).toBe(false);
    const groups = groupMergeableSpans([a, b]);
    expect(groups).toHaveLength(2);
  });

  it("does not merge different fonts", () => {
    const a = span("A", 10, 200, 6, 10);
    const b = span("B", 16, 200, 6, 20);
    b.fontDict = cosDict(new Map([["BaseFont", cosName("Times-Roman")]]));
    expect(spansMergeable(a, b)).toBe(false);
  });

  it("inserts spaces at camelCase word boundaries in per-glyph PDFs", () => {
    const chars = "AutistacamionArceseTransporti".split("");
    const spans = chars.map((ch, i) =>
      span(ch, 100 + i * 5.7, 200, 5.5, 100 + i * 10)
    );
    expect(mergedSpanText(spans)).toBe("Autistacamion Arcese Transporti");
  });

  it("merges when font resource names differ but BaseFont matches", () => {
    const a = span("T", 100, 200, 8, 100);
    const b = span("ransport", 107.5, 200, 52, 200);
    b.fontRef = "F2";
    expect(spansMergeable(a, b)).toBe(true);
  });
});
