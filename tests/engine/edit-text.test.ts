import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  CosDocument,
  editText,
  encodeLocator,
  decodeLocator,
  spliceStream,
  buildShowReplacement,
  type EditLocator,
  type TextSpan,
} from "../../src/lib/pdf-engine/core";
import { bytesEqual } from "../../src/lib/pdf-engine/core/bytes";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

async function open(bytes: Uint8Array): Promise<CosDocument> {
  return CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
}

/** First editable run whose text is at least `minLen` simple characters. */
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
      if (t.length >= minLen && /^[\x20-\x7e]+$/.test(t)) return { span, page: i + 1 };
    }
  }
  return undefined;
}

describe("edit-run primitives", () => {
  it("splices non-overlapping regions in offset order", () => {
    const src = new TextEncoder().encode("AAAA(x)Tj BBBB(y)Tj CCCC");
    const out = spliceStream(src, [
      { regionStart: 4, regionEnd: 9, replacement: new TextEncoder().encode("[<41>]TJ") },
      { regionStart: 14, regionEnd: 19, replacement: new TextEncoder().encode("[<42>]TJ") },
    ]);
    expect(new TextDecoder().decode(out)).toBe("AAAA[<41>]TJ BBBB[<42>]TJ CCCC");
  });

  it("rejects overlapping edits", () => {
    const src = new Uint8Array(20);
    expect(() =>
      spliceStream(src, [
        { regionStart: 0, regionEnd: 10, replacement: new Uint8Array() },
        { regionStart: 5, regionEnd: 12, replacement: new Uint8Array() },
      ])
    ).toThrow();
  });

  it("builds canonical TJ replacements per operator", () => {
    const bytes = new Uint8Array([0x41, 0x42]); // "AB"
    expect(new TextDecoder().decode(buildShowReplacement({ op: "Tj" }, bytes, 0))).toBe("[<4142>] TJ");
    expect(new TextDecoder().decode(buildShowReplacement({ op: "TJ" }, bytes, -25))).toBe(
      "[<4142> -25] TJ"
    );
    expect(new TextDecoder().decode(buildShowReplacement({ op: "'" }, bytes, 0))).toBe(
      "T* [<4142>] TJ"
    );
    expect(
      new TextDecoder().decode(buildShowReplacement({ op: '"', aw: 3, ac: 1 }, bytes, 0))
    ).toBe("3 Tw 1 Tc T* [<4142>] TJ");
  });
});

describe("locator codec", () => {
  it("round-trips", () => {
    const loc: EditLocator = { page: 2, streamNum: 41, regionStart: 1234 };
    expect(decodeLocator(encodeLocator(loc))).toEqual(loc);
  });
  it("rejects malformed ids", () => {
    expect(decodeLocator("blk_deadbeef")).toBeUndefined();
  });
});

describe("editText incremental update", () => {
  it("keeps original bytes byte-identical and changes the run text", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    expect(found).toBeDefined();
    const { span, page } = found!;
    const original_text = span.text!;
    // Swap first two characters: guaranteed to use only glyphs already present.
    const newText =
      original_text.length >= 2
        ? original_text[1]! + original_text[0]! + original_text.slice(2)
        : original_text;

    const locator: EditLocator = {
      page,
      streamNum: span.source!.streamNum,
      regionStart: span.source!.regionStart,
    };
    const result = await editText(doc, [{ locator, newText }], nodeAdapters.deflate);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    // Incremental update: the original bytes are copied verbatim as a prefix.
    expect(result.output.length).toBeGreaterThan(original.length);
    expect(bytesEqual(result.output.subarray(0, original.length), original)).toBe(true);

    // Re-open the edited PDF and confirm the run now reads the new text.
    const doc2 = await open(result.output);
    expect(doc2.pages().length).toBe(doc.pages().length);
    const { spans } = await doc2.pageSpans(doc2.pages()[page - 1]!);
    const edited = spans.find(
      (s) => s.source && s.source.regionStart != null && (s.text ?? "").startsWith(newText.slice(0, 2))
    );
    expect(edited).toBeDefined();
    expect(edited!.text).toContain(newText.slice(0, Math.min(6, newText.length)));
  });

  it("appends a classic xref table for classic-xref files", async () => {
    const original = load("cv-like.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    expect(found).toBeDefined();
    const { span, page } = found!;
    const t = span.text!;
    const newText = t.length >= 2 ? t[1]! + t[0]! + t.slice(2) : t;

    const result = await editText(
      doc,
      [
        {
          locator: {
            page,
            streamNum: span.source!.streamNum,
            regionStart: span.source!.regionStart,
          },
          newText,
        },
      ],
      nodeAdapters.deflate
    );
    expect(result.applied).toHaveLength(1);
    // Byte-stable prefix + a classic incremental xref section was appended.
    expect(bytesEqual(result.output.subarray(0, original.length), original)).toBe(true);
    const tail = new TextDecoder().decode(result.output.subarray(original.length));
    expect(tail).toContain("xref");
    expect(tail).toContain("trailer");
    expect(tail).toContain("/Prev");

    const doc2 = await open(result.output);
    expect(doc2.pages().length).toBe(doc.pages().length);
  });

  it("skips a no-op edit list without corrupting output", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const result = await editText(doc, []);
    expect(bytesEqual(result.output, original)).toBe(true);
  });

  it("reports unencodable characters and applies no change", async () => {
    const original = load("1.pdf");
    const doc = await open(original);
    const found = await findEditableSpan(doc);
    const { span, page } = found!;
    const locator: EditLocator = {
      page,
      streamNum: span.source!.streamNum,
      regionStart: span.source!.regionStart,
    };
    // A CJK char is not in any Latin subset.
    const result = await editText(doc, [{ locator, newText: "漢字テスト" }]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe("unencodable");
    expect(bytesEqual(result.output, original)).toBe(true);
  });
});
