import { describe, expect, it } from "vitest";
import { insertTextBlocks } from "../../src/lib/pdf-engine/core/editor/insert-text";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { extractDocument } from "../../src/lib/pdf-engine/extract";
import { loadFixture } from "./util";

describe("insertTextBlocks", () => {
  it("registers a page-level standard font when forms own all font resources", async () => {
    const input = loadFixture("cv-like.pdf");
    const block = {
      id: "new:test",
      page: 1,
      text: "New text",
      created: true,
      modified: true,
      insertAt: { px: 100, py: 700 },
      bbox: { px: 100, py: 680, pw: 120, ph: 14 },
      baselineY: 700,
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
    };

    const result = await insertTextBlocks(
      input,
      [block],
      nodeAdapters.deflate,
      nodeAdapters.inflate
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);

    const doc = await extractDocument(Buffer.from(result.output));
    expect(doc.pages[0].blocks.some((b) => b.text.includes("New text"))).toBe(true);
  });

  it("inserts on cv-like fixture", async () => {
    const input = loadFixture("cv-like.pdf");
    const block = {
      id: "new:test2",
      page: 1,
      text: "Added line",
      created: true,
      modified: true,
      insertAt: { px: 72, py: 700 },
      bbox: { px: 72, py: 680, pw: 120, ph: 14 },
      baselineY: 700,
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
    };

    const result = await insertTextBlocks(
      input,
      [block],
      nodeAdapters.deflate,
      nodeAdapters.inflate
    );
    expect(result.inserted).toBe(1);
  });
});
