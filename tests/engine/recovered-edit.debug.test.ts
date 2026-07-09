import { appendFileSync, readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { pdfEngineExtract, pdfEngineApply } from "../../src/lib/pdf-engine/run";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import type { PdfEditPatch } from "../../src/lib/pdf/edit-model";

const LOG = path.join(process.cwd(), ".cursor/debug-ee9354.log");
function log(data: Record<string, unknown>) {
  try {
    appendFileSync(LOG, JSON.stringify({ sessionId: "ee9354", runId: "post-fix", ...data, timestamp: Date.now() }) + "\n");
  } catch { /* ignore */ }
}

/** Break the final `startxref` offset so CosDocument.open falls into recovery. */
function forceRecovery(bytes: Buffer): Buffer {
  const s = "startxref";
  const idx = bytes.lastIndexOf(s);
  if (idx < 0) throw new Error("no startxref in fixture");
  // Point startxref at offset 0 (=> "%PDF", not an xref => triggers recovery).
  const copy = Buffer.from(bytes);
  let p = idx + s.length;
  while (p < copy.length && (copy[p] === 0x0d || copy[p] === 0x0a || copy[p] === 0x20)) p++;
  // Overwrite the digits that follow with zeros.
  while (p < copy.length && copy[p]! >= 0x30 && copy[p]! <= 0x39) {
    copy[p] = 0x30;
    p++;
  }
  return copy;
}

const FIXTURES = [
  "tests/fixtures/cv-like.pdf",
  "tests/fixtures/text-simple.pdf",
  "tests/fixtures/font-winansi.pdf",
  "tests/fixtures/font-widths.pdf",
  "tests/fixtures/text-cm-tstar.pdf",
];

describe("recovered-file native in-place delete (synthesized)", () => {
  it("removes original glyphs on a recovered PDF (no overlay fallback)", async () => {
    let tested = 0;

    for (const rel of FIXTURES) {
      const original = readFileSync(path.join(process.cwd(), rel));
      const broken = forceRecovery(original);

      let doc: CosDocument;
      try {
        doc = await CosDocument.open(new Uint8Array(broken), { inflate: nodeAdapters.inflate });
      } catch (err) {
        log({ location: "recovered-edit", file: rel, openThrew: String((err as Error).message) });
        continue;
      }
      log({ location: "recovered-edit", file: rel, recovered: doc.recovered, encrypted: doc.encrypted });
      if (!doc.recovered || doc.encrypted) continue;

      const model = await pdfEngineExtract(broken);
      let target: PdfEditPatch["blocks"][number] | undefined;
      for (const pg of model.pages) {
        for (const b of pg.blocks) {
          if (b.locator && b.text.trim().length >= 3) {
            target = { id: b.id, page: b.page, text: b.text, bbox: b.bbox, font: b.font, locator: b.locator };
            break;
          }
        }
        if (target) break;
      }
      if (!target) { log({ location: "recovered-edit", file: rel, note: "no editable block" }); continue; }

      const deletedText = target.text!;
      const patch: PdfEditPatch = {
        documentId: model.documentId,
        blocks: [{ ...target, text: "", deleted: true, modified: true }],
      };

      const output = await pdfEngineApply(broken, patch);
      const prefixStable = output.subarray(0, broken.length).equals(broken);

      const doc2 = await CosDocument.open(new Uint8Array(output), { inflate: nodeAdapters.inflate });
      const model2 = await pdfEngineExtract(Buffer.from(output));
      const stillThere = model2.pages.some((p) =>
        p.blocks.some((b) => b.locator === target!.locator && b.text === deletedText)
      );
      const pagesOk = doc2.pages().length === doc.pages().length;

      log({
        location: "recovered-edit", file: rel, prefixStable, pagesOk,
        deletedTextGone: !stillThere, reopenRecovered: doc2.recovered, deletedText: deletedText.slice(0, 40),
      });

      expect(pagesOk, `${rel}: page count changed`).toBe(true);
      expect(prefixStable, `${rel}: overlay fallback (bytes not appended)`).toBe(true);
      expect(stillThere, `${rel}: deleted text still present`).toBe(false);
      // The edited output should itself reopen via a valid xref (not need recovery).
      expect(doc2.recovered, `${rel}: edited output still needs recovery`).toBe(false);

      tested++;
    }

    log({ location: "recovered-edit", summary: true, tested });
    expect(tested).toBeGreaterThan(0);
  });
});
