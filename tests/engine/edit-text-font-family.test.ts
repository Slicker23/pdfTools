import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CosDocument, editText, encodeLocator } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

async function open(bytes: Uint8Array): Promise<CosDocument> {
  return CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
}

describe("editText native font swap (cv-like.pdf)", () => {
  it("swaps regular Helvetica to Helvetica-Bold via page /F2", async () => {
    const original = load("cv-like.pdf");
    const doc = await open(original);
    const page = doc.pages()[0]!;
    const { spans } = await doc.pageSpans(page);
    const span = spans.find((s) => s.text === "Contact" && s.fontRef === "F1");
    expect(span?.source).toBeDefined();

    const locator = {
      page: 1,
      streamNum: span!.source!.streamNum,
      regionStart: span!.source!.regionStart,
    };

    const result = await editText(
      doc,
      [
        {
          locator,
          newText: span!.text!,
          newBold: true,
        },
      ],
      nodeAdapters.deflate
    );
    expect(result.skipped, JSON.stringify(result.skipped)).toHaveLength(0);

    const doc2 = await open(result.output);
    const { spans: spans2 } = await doc2.pageSpans(doc2.pages()[0]!);
    const edited = spans2.find((s) => s.text === "Contact");
    expect(edited?.fontRef).toBe("F2");
  });

  it("skips font family change when target font is absent from page resources", async () => {
    const original = load("cv-like.pdf");
    const doc = await open(original);
    const page = doc.pages()[0]!;
    const { spans } = await doc.pageSpans(page);
    const span = spans.find((s) => s.text === "John Developer" && s.source);
    expect(span?.source).toBeDefined();

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
          newFontFamily: "Times-Roman",
        },
      ],
      nodeAdapters.deflate
    );
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("not-editable");
  });
});
