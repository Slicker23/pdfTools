import { describe, expect, it } from "vitest";
import { CosDocument, loadFont, lookupResource, isDict } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

async function fontFor(fixture: string) {
  const doc = await open(loadFixture(fixture));
  const dict = lookupResource(doc, doc.pages()[0]!.resources, "Font", "F1");
  if (!isDict(dict)) throw new Error("font dict not found");
  return loadFont(doc, dict, () => undefined);
}

describe("simple-font widths", () => {
  it("uses base-14 AFM widths when /Widths is absent", async () => {
    const font = await fontFor("font-widths.pdf");
    expect(font.isType0).toBe(false);
    expect(font.widthOfCode(65)).toBe(667); // 'A' in Helvetica
    expect(font.widthOfCode(86)).toBe(667); // 'V' in Helvetica
  });

  it("prefers explicit /Widths over the base-14 AFM", async () => {
    const font = await fontFor("font-embedded-widths.pdf");
    expect(font.widthOfCode(65)).toBe(1000); // explicit override
    expect(font.widthOfCode(66)).toBe(667); // outside /Widths -> AFM 'B'
  });
});

describe("type0-font widths", () => {
  it("uses /W with /DW fallback (arg is a CID)", async () => {
    const font = await fontFor("font-type0-identity.pdf");
    expect(font.isType0).toBe(true);
    expect(font.widthOfCode(1)).toBe(500);
    expect(font.widthOfCode(2)).toBe(600);
    expect(font.widthOfCode(3)).toBe(1000); // /DW default
  });
});
