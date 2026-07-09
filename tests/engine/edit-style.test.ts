import { describe, expect, it } from "vitest";
import {
  buildStyleAndShowReplacement,
  discoverTextBlockContext,
  effectiveVisualSize,
  styleChangeRequested,
} from "../../src/lib/pdf-engine/core/editor/edit-style";
import { tokenizeContent } from "../../src/lib/pdf-engine/core/content/tokenizer";
import { spliceStream } from "../../src/lib/pdf-engine/core/editor/edit-run";
import type { SpanSource, TextSpan } from "../../src/lib/pdf-engine/core/content/types";

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function showRegion(op: ReturnType<typeof tokenizeContent> extends Generator<infer T> ? T : never) {
  return {
    start: op.operandsStart >= 0 ? op.operandsStart : op.opStart,
    end: op.opEnd,
  };
}

describe("edit-style discovery", () => {
  const stream = new TextEncoder().encode(
    "q BT /F2 18 Tf 0.1 0.2 0.3 rg 72 700 Td (Hello) Tj ET Q"
  );

  it("finds an isolated BT block context", () => {
    const ops = [...tokenizeContent(stream)];
    const show = ops.find((o) => o.op === "Tj")!;
    const region = showRegion(show);
    const ctx = discoverTextBlockContext(stream, region.start, region.end);
    expect(ctx).toBeDefined();
    expect(ctx!.fontRef).toBe("F2");
    expect(ctx!.fontSize).toBe(18);
    expect(ctx!.fillRgb).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(decode(ctx!.positionBytes)).toContain("72 700 Td");
  });

  it("returns undefined for shared-state BT blocks", () => {
    const shared = new TextEncoder().encode(
      "BT /F1 12 Tf 0 0 0 rg 10 20 Td (A) Tj 30 0 Td (B) Tj ET"
    );
    const ops = [...tokenizeContent(shared)];
    const secondShow = ops.filter((o) => o.op === "Tj")[1]!;
    const region = showRegion(secondShow);
    expect(discoverTextBlockContext(shared, region.start, region.end)).toBeUndefined();
  });

  it("splices style + show replacement bytes", () => {
    const ops = [...tokenizeContent(stream)];
    const show = ops.find((o) => o.op === "Tj")!;
    const region = showRegion(show);
    const source: SpanSource = {
      op: "Tj",
      streamNum: 4,
      regionStart: region.start,
      regionEnd: region.end,
    };
    const ctx = discoverTextBlockContext(stream, region.start, region.end)!;
    const span: TextSpan = {
      origin: { x: 72, y: 700 },
      matrix: [18, 0, 0, 18, 72, 700],
      fontRef: "F2",
      fontSize: 18,
      renderMode: 0,
      fillColor: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
      codes: new Uint8Array(),
      items: [],
      text: "Hello",
    };
    const replacement = buildStyleAndShowReplacement(
      ctx,
      source,
      span,
      new Uint8Array([0x58]),
      0,
      { newColor: "#ff0000", newSize: 24 }
    )!;
    const out = decode(
      spliceStream(stream, [{ regionStart: ctx.prefixStart, regionEnd: ctx.showEnd, replacement }])
    );
    expect(out).toContain("/F2 24 Tf 1 0 0 rg");
    expect(out).toContain("[<58>] TJ");
  });
});

describe("styleChangeRequested", () => {
  const span: TextSpan = {
    origin: { x: 0, y: 0 },
    matrix: [12, 0, 0, 12, 0, 0],
    fontRef: "F1",
    fontSize: 12,
    renderMode: 0,
    fillColor: { r: 0, g: 0, b: 0, a: 1 },
    codes: new Uint8Array(),
    items: [],
  };

  it("detects color and size deltas", () => {
    expect(styleChangeRequested(span, "#000000", 12)).toBe(false);
    expect(styleChangeRequested(span, "#ff0000", 12)).toBe(true);
    expect(styleChangeRequested(span, "#000000", 18)).toBe(true);
    expect(effectiveVisualSize(span)).toBe(12);
  });

  it("detects style deltas against extract-time original", () => {
    expect(
      styleChangeRequested(span, "#242424", 36, undefined, { color: "#111111", size: 12 })
    ).toBe(true);
    expect(
      styleChangeRequested(span, "#242424", 36, undefined, { color: "#242424", size: 36 })
    ).toBe(false);
  });
});
