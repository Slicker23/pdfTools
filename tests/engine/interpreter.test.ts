import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import {
  CosDocument,
  cosDict,
  interpretContent,
  type Matrix,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { ascii, loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
const codes = (b: Uint8Array) => Buffer.from(b).toString("latin1");

function expectMatrix(m: Matrix, expected: Matrix): void {
  for (let i = 0; i < 6; i++) expect(m[i]).toBeCloseTo(expected[i]!, 5);
}

describe("interpreter: exact geometry on hand-built fixtures", () => {
  it("text-simple: absolute Td origin + text matrix", async () => {
    const doc = await open(loadFixture("text-simple.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);

    expect(spans.length).toBe(1);
    const s = spans[0]!;
    expect(s.origin.x).toBeCloseTo(100, 5);
    expect(s.origin.y).toBeCloseTo(700, 5);
    expectMatrix(s.matrix, [24, 0, 0, 24, 100, 700]);
    expect(s.fontRef).toBe("F1");
    expect(s.fontSize).toBe(24);
    expect(codes(s.codes)).toBe("Hi");
  });

  it("text-cm-tstar: cm translation + T* leading (width-free)", async () => {
    const doc = await open(loadFixture("text-cm-tstar.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);

    expect(spans.length).toBe(2);
    const [a, b] = spans;
    expect(a!.origin.x).toBeCloseTo(50, 5);
    expect(a!.origin.y).toBeCloseTo(650, 5);
    expect(codes(a!.codes)).toBe("A");
    expect(b!.origin.x).toBeCloseTo(50, 5);
    expect(b!.origin.y).toBeCloseTo(638, 5);
    expect(codes(b!.codes)).toBe("B");
  });

  it("text-form-xobject: /Matrix composes onto the CTM", async () => {
    const doc = await open(loadFixture("text-form-xobject.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);

    expect(spans.length).toBe(1);
    const s = spans[0]!;
    expect(s.origin.x).toBeCloseTo(30, 5);
    expect(s.origin.y).toBeCloseTo(140, 5);
    expect(codes(s.codes)).toBe("X");
  });
});

describe("interpreter: state-machine units", () => {
  const res = cosDict([]);
  const runText = (src: string) =>
    interpretContent(ascii(src), { resources: res, fontLookup: () => undefined });

  it("q/Q isolates a cm transform", () => {
    // The cm is confined to q..Q, so text afterwards is at the origin.
    const spans = runText("q 1 0 0 1 100 0 cm Q BT /F1 10 Tf 0 0 Td (x) Tj ET");
    expect(spans.length).toBe(1);
    expect(spans[0]!.origin.x).toBeCloseTo(0, 5);
    expect(spans[0]!.origin.y).toBeCloseTo(0, 5);
  });

  it("captures render mode and rgb fill color", () => {
    const spans = runText("1 0 0 rg BT /F1 10 Tf 3 Tr 5 5 Td (x) Tj ET");
    expect(spans.length).toBe(1);
    const s = spans[0]!;
    expect(s.renderMode).toBe(3);
    expect(s.fillColor).toMatchObject({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("TD sets leading to -ty and moves the line", () => {
    // First show at 700; then TD 0 -15 sets leading 15 and moves to 685.
    const spans = runText("BT /F1 10 Tf 0 700 Td (A) Tj 0 -15 TD (B) Tj ET");
    expect(spans[0]!.origin.y).toBeCloseTo(700, 5);
    expect(spans[1]!.origin.y).toBeCloseTo(685, 5);
  });

  it("Tm replaces the text matrix", () => {
    const spans = runText("BT /F1 10 Tf 0 0 Td (A) Tj 2 0 0 2 300 400 Tm (B) Tj ET");
    expect(spans[1]!.origin.x).toBeCloseTo(300, 5);
    expect(spans[1]!.origin.y).toBeCloseTo(400, 5);
    expectMatrix(spans[1]!.matrix, [20, 0, 0, 20, 300, 400]);
  });
});

describe("interpreter: one tight pdfium oracle point", () => {
  it("text-simple first span aligns with pdfium first text object", async () => {
    const bytes = loadFixture("text-simple.pdf");
    const doc = await open(bytes);
    const { spans } = await doc.pageSpans(doc.pages()[0]!);
    const s = spans[0]!;

    const oracle = await loadDocument(Buffer.from(bytes));
    try {
      const page = await oracle.getPage(0);
      try {
        let first: { left: number; top: number; bottom: number } | undefined;
        for await (const o of page.objects()) {
          if (o.type === "text") {
            first = o.bounds;
            break;
          }
        }
        expect(first).toBeDefined();
        if (!first) return;
        // The span origin is the pen position; pdfium's bbox.left is the glyph
        // ink edge, offset to the right by the left side bearing (a few points).
        expect(s.origin.x).toBeLessThanOrEqual(first.left + 0.5);
        expect(s.origin.x).toBeGreaterThanOrEqual(first.left - 4);
        expect(s.origin.y).toBeGreaterThanOrEqual(first.bottom - 1.5);
        expect(s.origin.y).toBeLessThanOrEqual(first.top + 1.5);
      } finally {
        page.close();
      }
    } finally {
      oracle.destroy();
    }
  });
});
