import { describe, expect, it } from "vitest";
import {
  CosDocument,
  dictGet,
  isDict,
  isName,
  listResourceEntries,
  lookupResource,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadCorpus, loadCorpusFile, loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

describe("page resources", () => {
  it("exposes named resources on a page", async () => {
    const doc = await open(loadFixture("content-array.pdf"));
    const page = doc.pages()[0]!;

    const font = lookupResource(doc, page.resources, "Font", "F1");
    expect(isDict(font)).toBe(true);
    expect(isName(dictGet(font, "Subtype"))).toBe(true);
    expect(dictGet(font, "Subtype")).toMatchObject({ name: "Type1" });

    expect(listResourceEntries(doc, page.resources, "Font").size).toBeGreaterThanOrEqual(1);
  });

  it("inherits /Resources from an ancestor /Pages node", async () => {
    const doc = await open(loadFixture("inherited-resources.pdf"));
    const page = doc.pages()[0]!;

    // The leaf page has no /Resources of its own.
    expect(dictGet(page.dict, "Resources")).toBeUndefined();
    // ...but the effective resources come from the intermediate /Pages node.
    const font = lookupResource(doc, page.resources, "Font", "F1");
    expect(isDict(font)).toBe(true);
    expect(dictGet(font, "BaseFont")).toMatchObject({ name: "Times-Roman" });
  });

  it("every corpus page has at least one resolvable /Font (unencrypted)", async () => {
    for (const entry of loadCorpus()) {
      if (entry.encrypted) continue;
      const doc = await open(loadCorpusFile(entry.file));
      for (const page of doc.pages()) {
        const fonts = listResourceEntries(doc, page.resources, "Font");
        expect(fonts.size).toBeGreaterThanOrEqual(1);
        for (const font of fonts.values()) expect(isDict(font)).toBe(true);
      }
    }
  });
});
