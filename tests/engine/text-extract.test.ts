import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

async function firstText(fixture: string): Promise<string | undefined> {
  const doc = await open(loadFixture(fixture));
  const { spans } = await doc.pageSpans(doc.pages()[0]!);
  return spans[0]!.text;
}

describe("text extraction (Unicode per span)", () => {
  it("decodes base-14 StandardEncoding text", async () => {
    expect(await firstText("text-simple.pdf")).toBe("Hi");
    expect(await firstText("font-widths.pdf")).toBe("AV");
  });

  it("decodes WinAnsiEncoding accented characters", async () => {
    expect(await firstText("font-winansi.pdf")).toBe("\u00e9\u00fc\u00f1");
  });

  it("applies /Encoding /Differences before the AGL", async () => {
    expect(await firstText("font-differences.pdf")).toBe("\u00e9");
  });

  it("prefers /ToUnicode over the encoding", async () => {
    // Encoding says 'A' but ToUnicode remaps code 0x41 -> U+00E9.
    expect(await firstText("font-tounicode.pdf")).toBe("\u00e9");
  });

  it("decodes Type0 Identity-H text via /ToUnicode", async () => {
    expect(await firstText("font-type0-identity.pdf")).toBe("Hi");
  });
});
