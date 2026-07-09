import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import { applyOverlayFull } from "../../src/lib/pdf-engine/apply-full";
import { applyNativePatch } from "../../src/lib/pdf-engine/apply-native";
import { createBrowserOverlayPlatform } from "../../src/lib/pdf-engine/apply-overlay-browser";
import { browserAdapters } from "../../src/lib/pdf-engine/browser/platform-browser";
import { pdfEngineExtract } from "../../src/lib/pdf-engine/run";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadFixture } from "./util";

const NOTO = readFileSync(path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"));

describe("applyOverlayFull (browser platform)", () => {
  it("draws overlay blocks with injected bg samples", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("NotoSans-Regular.ttf")) {
          return new Response(NOTO, { status: 200 });
        }
        return new Response(null, { status: 404 });
      })
    );

    const input = loadFixture("cv-like.pdf");
    const doc = await pdfEngineExtract(Buffer.from(input));
    const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.locator && b.text.length >= 3);
    expect(block).toBeDefined();

    const overlayBlock: PdfEditBlockPatch = {
      id: block!.id,
      page: block!.page,
      text: block!.text,
      bbox: block!.bbox,
      font: { ...block!.font, name: "Times-Roman" },
      locator: block!.locator,
      encodableChars: block!.encodableChars,
      modified: true,
      overlay: true,
    };

    const patch = { documentId: doc.documentId, blocks: [overlayBlock] };
    const { output, overlayBlocks } = await applyNativePatch(input, patch, nodeAdapters);
    expect(overlayBlocks.length).toBeGreaterThan(0);

    const bg = new Map<string, { r: number; g: number; b: number }>([
      [block!.id, { r: 0.9, g: 0.85, b: 0.8 }],
    ]);

    const out = await applyOverlayFull(
      output,
      overlayBlocks,
      browserAdapters,
      createBrowserOverlayPlatform(),
      async () => bg
    );

    expect(out.length).toBeGreaterThan(output.length);
    const extracted = await pdfEngineExtract(Buffer.from(out));
    const texts = extracted.pages.flatMap((p) => p.blocks.map((b) => b.text));
    expect(texts.some((t) => t.includes(block!.text.slice(0, 4)))).toBe(true);

    vi.unstubAllGlobals();
  });
});
