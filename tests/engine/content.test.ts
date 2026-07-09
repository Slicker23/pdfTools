import { describe, expect, it } from "vitest";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadCorpus, loadCorpusFile, loadFixture } from "./util";

const open = (bytes: Uint8Array) => CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("content-stream access", () => {
  it("concatenates an array of /Contents streams with a newline separator", async () => {
    const doc = await open(loadFixture("content-array.pdf"));
    const page = doc.pages()[0]!;
    const content = text(await doc.pageContent(page));

    const s1 = "BT /F1 12 Tf 72 720 Td (Hello) Tj ET\n";
    const s2 = "0 0 1 rg 10 10 100 100 re f\n";
    expect(content).toBe(s1 + "\n" + s2);
  });

  it("decodes a single /Contents stream (corpus)", async () => {
    for (const entry of loadCorpus()) {
      if (entry.encrypted) continue;
      const doc = await open(loadCorpusFile(entry.file));
      for (const page of doc.pages()) {
        const content = await doc.pageContent(page);
        expect(content.length).toBeGreaterThan(0);
      }
    }
  });
});
