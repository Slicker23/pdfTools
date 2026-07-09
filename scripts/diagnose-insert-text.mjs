/**
 * Verify native insertText for user-created blocks.
 *
 * Usage:
 *   PDF_PATH=/path/to/your.pdf npx tsx scripts/diagnose-insert-text.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { pdfEngineApply, pdfEngineExtract } from "../src/lib/pdf-engine/run.ts";

const pdfPath = process.env.PDF_PATH;
if (!pdfPath) {
  console.error("Set PDF_PATH to your test PDF.");
  process.exit(1);
}

const input = readFileSync(pdfPath);
const model = await pdfEngineExtract(input);
const page = model.pages[0];
if (!page) {
  console.error("FAIL: no pages");
  process.exit(1);
}

const marker = `INSERT_${Date.now().toString(36).slice(-4)}`;
const patch = {
  documentId: model.documentId,
  blocks: [
    {
      id: "new:p1:diag",
      page: 1,
      text: marker,
      created: true,
      modified: true,
      insertAt: { px: 72, py: page.height - 72 },
      bbox: { px: 72, py: page.height - 84, pw: 200, ph: 14 },
      baselineY: page.height - 72,
      font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
    },
  ],
};

const output = await pdfEngineApply(input, patch);
const outPath = pdfPath.replace(/\.pdf$/i, "") + ".diagnose-insert.pdf";
writeFileSync(outPath, output);

const after = await pdfEngineExtract(output);
const allText = after.pages.flatMap((p) => p.blocks).map((b) => b.text);
const found = allText.some((t) => t.includes(marker));

console.log({
  marker,
  outputBytes: output.length,
  foundInReExtract: found,
  outPath,
});

process.exit(found ? 0 : 1);
