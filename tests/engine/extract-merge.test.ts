import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { extractDocument } from "../../src/lib/pdf-engine/extract";

const FIXTURES = path.join(process.cwd(), "tests/fixtures");

describe("extractDocument span merge", () => {
  it("keeps single-run blocks without segments", async () => {
    const input = Buffer.from(readFileSync(path.join(FIXTURES, "text-simple.pdf")));
    const doc = await extractDocument(input);
    const block = doc.pages.flatMap((p) => p.blocks)[0];
    expect(block?.text).toBe("Hi");
    expect(block?.segments).toBeUndefined();
  });

  it("block count matches merge groups on cv-like.pdf", async () => {
    const input = Buffer.from(readFileSync(path.join(FIXTURES, "cv-like.pdf")));
    const doc = await extractDocument(input);
    const blocks = doc.pages.flatMap((p) => p.blocks);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      if (block.segments && block.segments.length > 1) {
        expect(block.text.length).toBeGreaterThanOrEqual(
          block.segments.reduce((n, s) => n + s.text.length, 0)
        );
      }
    }
  });
});
