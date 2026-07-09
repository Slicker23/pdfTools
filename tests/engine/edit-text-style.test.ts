import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CosDocument, editText, fillColorToHex } from "../../src/lib/pdf-engine/core";
import { effectiveVisualSize } from "../../src/lib/pdf-engine/core/editor/edit-style";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

async function open(bytes: Uint8Array): Promise<CosDocument> {
  return CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
}

describe("editText native style (cv-like.pdf)", () => {
  it("applies color-only and size-only edits in isolated BT blocks", async () => {
    const original = load("cv-like.pdf");
    const doc = await open(original);
    const page = doc.pages()[0]!;
    const { spans } = await doc.pageSpans(page);
    const span = spans.find((s) => s.source && s.text && s.text.length >= 3 && s.fillColor);
    expect(span).toBeDefined();

    const oldColor = fillColorToHex(span!.fillColor!);
    const oldSize = effectiveVisualSize(span!);
    const newColor = oldColor === "#ff0000" ? "#00ff00" : "#ff0000";
    const newSize = oldSize === 24 ? 20 : 24;

    const result = await editText(
      doc,
      [
        {
          locator: {
            page: 1,
            streamNum: span!.source!.streamNum,
            regionStart: span!.source!.regionStart,
          },
          newText: span!.text!,
          newColor,
          newSize,
        },
      ],
      nodeAdapters.deflate
    );
    expect(result.skipped, JSON.stringify(result.skipped)).toHaveLength(0);
    expect(result.applied).toHaveLength(1);

    const doc2 = await open(result.output);
    const { spans: spans2 } = await doc2.pageSpans(doc2.pages()[0]!);
    const edited = spans2.find((s) => s.text === span!.text);
    expect(edited).toBeDefined();
    expect(fillColorToHex(edited!.fillColor!)).toBe(newColor);
    expect(Math.abs(effectiveVisualSize(edited!) - newSize)).toBeLessThan(0.5);
  });
});
