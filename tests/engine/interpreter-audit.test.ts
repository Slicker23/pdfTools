import { describe, expect, it } from "vitest";
import { CosDocument, type Matrix } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

function expectMatrix(m: Matrix, expected: Matrix): void {
  for (let i = 0; i < 6; i++) expect(m[i]).toBeCloseTo(expected[i]!, 5);
}

/**
 * Integration-audit regressions (M0-M3). These stress cases the pikepdf/
 * ghostscript corpus cannot: a rotated CTM combined with text (text-matrix
 * composition), nested Form XObjects with per-form resources, and a
 * self-referential Form XObject (cycle guard).
 */
describe("interpreter audit regressions", () => {
  it("composes a rotated cm with the text matrix (no transpose bug)", async () => {
    const doc = await open(loadFixture("audit-rotate.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);
    expect(spans.length).toBe(1);
    const s = spans[0]!;
    // cm = 90deg rotation + translate(300,100); text at (0,0), 20pt.
    expect(s.origin.x).toBeCloseTo(300, 5);
    expect(s.origin.y).toBeCloseTo(100, 5);
    expectMatrix(s.matrix, [0, 20, -20, 0, 300, 100]);
  });

  it("recurses nested Form XObjects and resolves per-form fonts", async () => {
    const doc = await open(loadFixture("audit-nestedform.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);
    expect(spans.length).toBe(1);
    const s = spans[0]!;
    // Fm1 /Matrix +(10,10) then Fm2 /Matrix +(20,20); text at (0,0) -> (30,30).
    expect(s.origin.x).toBeCloseTo(30, 5);
    expect(s.origin.y).toBeCloseTo(30, 5);
    expect(s.fontRef).toBe("F1");
    expect(s.fontDict).toBeDefined();
  });

  it("terminates on a self-referential Form XObject", async () => {
    const doc = await open(loadFixture("audit-cycle.pdf"));
    const { spans } = await doc.pageSpans(doc.pages()[0]!);
    // The form invokes itself (blocked by the visited guard) then shows (C) once.
    expect(spans.length).toBe(1);
    expect(spans[0]!.origin.x).toBeCloseTo(20, 5);
    expect(spans[0]!.origin.y).toBeCloseTo(20, 5);
  });

  it("degrades corrupt streams to empty instead of throwing", async () => {
    const doc = await open(loadFixture("audit-corrupt.pdf"));
    const pages = doc.pages();
    expect(pages.length).toBe(2);

    // Page 1: /Contents is an undecodable Flate stream -> no spans, no throw.
    const p1 = await doc.pageSpans(pages[0]!);
    expect(p1.spans.length).toBe(0);

    // Page 2: valid text plus a corrupt Form XObject -> page text still emitted,
    // the bad form degrades to empty rather than aborting the page.
    const p2 = await doc.pageSpans(pages[1]!);
    expect(p2.spans.length).toBe(1);
    expect(Buffer.from(p2.spans[0]!.codes).toString("latin1")).toBe("OK");
  });
});
