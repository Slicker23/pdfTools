import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  CosDocument,
  decodeLocator,
  relocateTextRuns,
  type EditLocator,
  type TextSpan,
} from "../../src/lib/pdf-engine/core";
import { applyPatch } from "../../src/lib/pdf-engine/apply";
import { pdfEngineExtract } from "../../src/lib/pdf-engine/run";
import { bytesEqual } from "../../src/lib/pdf-engine/core/bytes";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import type { PdfEditPatch } from "../../src/lib/pdf/edit-model";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

async function open(bytes: Uint8Array): Promise<CosDocument> {
  return CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
}

async function findEditableSpan(
  doc: CosDocument,
  minLen = 3
): Promise<{ span: TextSpan; page: number } | undefined> {
  const pages = doc.pages();
  for (let i = 0; i < pages.length; i++) {
    const { spans } = await doc.pageSpans(pages[i]!);
    for (const span of spans) {
      if (!span.source) continue;
      const t = span.text ?? "";
      if (t.length >= minLen && /^[\x20-\x7e]+$/.test(t)) {
        return { span, page: i + 1 };
      }
    }
  }
  return undefined;
}

describe("relocateTextRuns", () => {
  it("moves a run horizontally without overlay", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    expect(found).toBeDefined();
    const { span, page } = found!;
    const text = span.text!;
    const dx = 50;
    const newX = span.origin.x + dx;
    const newY = span.origin.y;

    const locator: EditLocator = {
      page,
      streamNum: span.source!.streamNum,
      regionStart: span.source!.regionStart,
    };

    const result = await relocateTextRuns(
      doc,
      [{ locator, x: newX, y: newY, text }],
      nodeAdapters.deflate
    );
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(bytesEqual(result.output.subarray(0, original.length), original)).toBe(true);

    const doc2 = await open(result.output);
    const { spans } = await doc2.pageSpans(doc2.pages()[page - 1]!);
    const moved = spans.find((s) => (s.text ?? "") === text && Math.abs(s.origin.x - newX) < 2);
    expect(moved).toBeDefined();

    const atOld = spans.find(
      (s) =>
        s.source &&
        s.source.streamNum === locator.streamNum &&
        s.source.regionStart === locator.regionStart &&
        (s.text ?? "").trim() === text
    );
    expect(atOld).toBeUndefined();
  });

  it("moves with changed encodable text", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    expect(found).toBeDefined();
    const { span, page } = found!;
    const orig = span.text!;
    const newText = orig.length >= 2 ? orig[1]! + orig[0]! + orig.slice(2) : orig;
    const newX = span.origin.x + 30;
    const newY = span.origin.y;

    const locator: EditLocator = {
      page,
      streamNum: span.source!.streamNum,
      regionStart: span.source!.regionStart,
    };

    const result = await relocateTextRuns(
      doc,
      [{ locator, x: newX, y: newY, text: newText }],
      nodeAdapters.deflate
    );
    expect(result.applied).toHaveLength(1);

    const doc2 = await open(result.output);
    const { spans } = await doc2.pageSpans(doc2.pages()[page - 1]!);
    const moved = spans.find(
      (s) =>
        (s.text ?? "").startsWith(newText.slice(0, 2)) &&
        Math.abs(s.origin.x - newX) < 2
    );
    expect(moved).toBeDefined();
  });

  it("skips multiline text", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    const { span, page } = found!;
    const locator: EditLocator = {
      page,
      streamNum: span.source!.streamNum,
      regionStart: span.source!.regionStart,
    };
    const result = await relocateTextRuns(doc, [
      { locator, x: span.origin.x, y: span.origin.y, text: "line1\nline2" },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe("not-editable");
    expect(bytesEqual(result.output, original)).toBe(true);
  });
});

describe("applyPatch native move", () => {
  it("relocates via applyPatch without overlay flag", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 3);
    expect(block).toBeDefined();

    const newBbox = {
      ...block!.bbox,
      px: block!.bbox.px + 40,
      py: block!.bbox.py + 10,
    };

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: newBbox,
          baselineY: (block!.baselineY ?? block!.bbox.py) + 10,
          font: block!.font,
          locator: block!.locator,
          originalBbox: block!.bbox,
          modified: true,
        },
      ],
    };

    const output = await applyPatch(Buffer.from(input), patch);
    const doc2 = await open(new Uint8Array(output));
    const locator = decodeLocator(block!.locator!)!;
    const { spans } = await doc2.pageSpans(doc2.pages()[block!.page - 1]!);
    const moved = spans.find(
      (s) =>
        (s.text ?? "") === block!.text &&
        Math.abs(s.origin.x - newBbox.px) < 3
    );
    expect(moved).toBeDefined();

    const stale = spans.find(
      (s) =>
        s.source &&
        s.source.streamNum === locator.streamNum &&
        s.source.regionStart === locator.regionStart &&
        (s.text ?? "").trim() === block!.text
    );
    expect(stale).toBeUndefined();
  });

  it("falls back to overlay when style changes on move", async () => {
    const input = load("1.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 3);
    expect(block).toBeDefined();

    const patch: PdfEditPatch = {
      documentId: doc.documentId,
      blocks: [
        {
          id: block!.id,
          page: block!.page,
          text: block!.text,
          bbox: { ...block!.bbox, px: block!.bbox.px + 20 },
          baselineY: block!.baselineY,
          font: { ...block!.font, size: block!.font.size + 4 },
          locator: block!.locator,
          originalBbox: block!.bbox,
          overlay: true,
          modified: true,
        },
      ],
    };

    const output = await applyPatch(Buffer.from(input), patch);
    expect(output.length).toBeGreaterThan(0);
  });
});
