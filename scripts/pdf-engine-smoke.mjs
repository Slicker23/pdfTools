/**
 * Node bridge smoke test for PDF engine.
 * Usage: PDF_PATH=/path/to/file.pdf npx tsx scripts/pdf-engine-smoke.mjs
 */
import { readFileSync } from "fs";
import { pdfEngineApply, pdfEngineExtract } from "../src/lib/pdf-engine/run.ts";

const pdfPath = process.env.PDF_PATH;
if (!pdfPath) {
  console.error("Error: set PDF_PATH to a test PDF.");
  console.error("  PDF_PATH=/path/to/CV.pdf npx tsx scripts/pdf-engine-smoke.mjs");
  process.exit(1);
}

const input = readFileSync(pdfPath);
console.log(`==> Extract (${input.length} bytes)`);
const doc = await pdfEngineExtract(input);

const blocks = doc.pages.flatMap((p) => p.blocks);
console.log(`==> Blocks: ${blocks.length}`);
if (blocks.length === 0) {
  console.error("Error: no blocks extracted");
  process.exit(1);
}

for (const b of blocks.slice(0, 5)) {
  console.log(`  [${b.page}] ${JSON.stringify(b.text.slice(0, 80))}`);
}

const target = { ...blocks[0], text: blocks[0].text + " [edited]", modified: true };
const patch = {
  documentId: doc.documentId,
  blocks: [
    {
      id: target.id,
      page: target.page,
      text: target.text,
      bbox: target.bbox,
      font: target.font,
      lineCount: target.lineCount,
      baselineY: target.baselineY,
      modified: true,
    },
  ],
};

console.log(`==> Apply patch on block: ${JSON.stringify(target.text.slice(0, 80))}`);
const output = await pdfEngineApply(input, patch);

if (!output.length) {
  console.error("Error: empty output PDF");
  process.exit(1);
}

console.log(`==> Node smoke test passed (${output.length} bytes)`);
