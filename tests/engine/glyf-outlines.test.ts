import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  CosDocument,
  loadOutlineFont,
  lookupResource,
  outlineBBox,
  parseTrueType,
  isDict,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const NOTO = resolve(__dirname, "../../public/fonts/NotoSans-Regular.ttf");

describe("TrueType glyf parser", () => {
  it("parses NotoSans and returns outline for letter H", () => {
    const buf = readFileSync(NOTO);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const face = parseTrueType(bytes);
    expect(face).toBeDefined();
    const gid = face!.gidForUnicode("H".codePointAt(0)!);
    expect(gid).toBeDefined();
    const outline = face!.getGlyphOutline(gid!);
    expect(outline!.segments.length).toBeGreaterThan(0);
    const bbox = outlineBBox(outline!.segments);
    expect(bbox).toBeDefined();
    expect(bbox![2]! - bbox![0]!).toBeGreaterThan(0);
  });
});

describe("embedded font outline fixture", () => {
  it("loads OutlineFont from font-outline-ttf.pdf", async () => {
    const bytes = loadFixture("font-outline-ttf.pdf");
    const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
    const page = doc.pages()[0]!;
    const dict = lookupResource(doc, page.resources, "Font", "F1");
    if (!isDict(dict)) throw new Error("font missing");
    const streamBytes = new Map();
    const font = loadOutlineFont(doc, dict, (s) => {
      const cached = streamBytes.get(s);
      if (cached) return cached;
      return undefined;
    });
    expect(font.hasOutlines).toBe(false); // streams not pre-decoded

    const outlineFont = await doc.buildOutlineFontForDict(dict);
    expect(outlineFont.hasOutlines).toBe(true);
    const outline = outlineFont.outlineForCode("H".charCodeAt(0), "H");
    expect(outline?.segments.length).toBeGreaterThan(0);
  });
});
